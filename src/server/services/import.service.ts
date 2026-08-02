import { db } from '../db';
import { tenantWhere, tenantOnly } from '../lib/tenant-context';
import { recordAudit } from './audit.service';
import { groupIntoJobs, type ResolvedRow } from './import';
import type { PreparedRow } from './import';
import type { Prisma, VisitStatus } from '@prisma/client';

/**
 * Escribe lo que el motor (`import.ts`) preparó.
 *
 * Todo o nada: una sola transacción. Si algo falla a mitad de camino no queda
 * media planilla cargada, que sería peor que no haber importado nada — el
 * usuario no tendría forma de saber dónde quedó.
 *
 * Cada fila creada queda marcada con el `importId`, que es lo que hace posible
 * deshacer el lote sin tocar lo que se cargó a mano.
 */

export type DuplicateStrategy = 'SKIP' | 'UPDATE' | 'CREATE_NEW';

export type ImportOutcome = {
  importId: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
};

/**
 * Clave de duplicado: nombre + dirección, normalizados igual que en el motor.
 *
 * Solo el nombre daría demasiados falsos positivos (dos "Kiosco Don José" que
 * no tienen nada que ver); nombre + dirección es lo que un humano miraría.
 */
const dedupeKeyOf = (name: string, address: string | null) =>
  `${name}|${address ?? ''}`
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export const executeClientImport = async ({
  tenantId,
  userId,
  rows,
  strategy,
  fileName,
  columnMapping,
  totalRows,
  errorRows,
}: {
  tenantId: string;
  userId: string;
  rows: PreparedRow[];
  strategy: DuplicateStrategy;
  fileName: string | null;
  columnMapping: Prisma.InputJsonValue;
  /** Filas del archivo, incluyendo las que el motor descartó. */
  totalRows: number;
  errorRows: number;
}): Promise<ImportOutcome> => {
  // Los existentes se leen una sola vez: hacer un findFirst por fila convierte
  // una importación de 2000 clientes en 2000 consultas.
  const existing = await db.client.findMany({
    where: tenantWhere(tenantId),
    select: { id: true, name: true, address: true },
  });

  const existingByKey = new Map(
    existing.map((client) => [dedupeKeyOf(client.name, client.address), client.id])
  );

  const outcome = await db.$transaction(async (tx) => {
    const importId = crypto.randomUUID();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    // Se van agregando los creados en esta corrida, para que dos filas
    // idénticas del mismo archivo no generen dos clientes con SKIP.
    const seen = new Map(existingByKey);

    for (const row of rows) {
      const name = String(row.values.name ?? '').trim();
      if (!name) continue;

      const address = (row.values.address as string | undefined) ?? null;
      const key = dedupeKeyOf(name, address);
      const duplicateId = seen.get(key);

      const data = {
        name,
        email: (row.values.email as string | undefined) ?? null,
        phone: (row.values.phone as string | undefined) ?? null,
        address,
        relationshipType:
          (row.values.relationshipType as 'CONTRACT' | 'ON_DEMAND' | undefined) ??
          'ON_DEMAND',
        status: (row.values.status as 'ACTIVE' | 'INACTIVE' | undefined) ?? 'ACTIVE',
        serviceTypes: (row.values.serviceTypes as string[] | undefined) ?? [],
        notes: (row.values.notes as string | undefined) ?? null,
      };

      try {
        if (duplicateId && strategy === 'SKIP') {
          skipped++;
          continue;
        }

        if (duplicateId && strategy === 'UPDATE') {
          // Un campo vacío en la planilla no borra lo que ya había: la
          // importación completa, no pisa.
          await tx.client.update({
            where: { id: duplicateId },
            data: Object.fromEntries(
              Object.entries(data).filter(([, value]) =>
                Array.isArray(value) ? value.length > 0 : value !== null
              )
            ),
          });
          updated++;
          continue;
        }

        const created = await tx.client.create({
          data: { ...data, tenantId, importId },
        });
        seen.set(key, created.id);
        imported++;
      } catch (error) {
        errors.push({
          row: row.row,
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    await tx.importHistory.create({
      data: {
        id: importId,
        tenantId,
        userId,
        entityType: 'clients',
        fileName,
        fileType: 'csv',
        totalRows,
        importedRows: imported,
        skippedRows: skipped,
        errorRows: errorRows + errors.length,
        errors: errors as unknown as Prisma.InputJsonValue,
        columnMapping,
        duplicateStrategy: strategy,
        status: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return { importId, imported, updated, skipped, failed: errors.length, errors };
  });

  await recordAudit({
    tenantId,
    userId,
    action: 'IMPORT',
    entityType: 'client',
    entityId: outcome.importId,
    changes: {
      importados: outcome.imported,
      actualizados: outcome.updated,
      omitidos: outcome.skipped,
      fallidos: outcome.failed,
    },
  });

  return outcome;
};

/**
 * Escribe el historial de visitas ya resuelto contra clientes existentes.
 *
 * Las visitas importadas **no** generan transacciones ni disparan
 * `onVisitStatusChange`: son historial, no trabajo que acaba de completarse. Si
 * las pasáramos por ese camino, importar dos años de visitas cobradas inventaría
 * dos años de ingresos hoy y dejaría Finanzas sin sentido.
 */
export const executeVisitImport = async ({
  tenantId,
  userId,
  rows,
  strategy,
  fileName,
  columnMapping,
  totalRows,
  errorRows,
}: {
  tenantId: string;
  userId: string;
  rows: ResolvedRow[];
  strategy: DuplicateStrategy;
  fileName: string | null;
  columnMapping: Prisma.InputJsonValue;
  totalRows: number;
  errorRows: number;
}): Promise<ImportOutcome & { jobsCreated: number }> => {
  const today = new Date();

  // Las filas que declaran "N de M" se agrupan en trabajos reales, si no
  // entrarían como visitas sueltas y Pendientes nunca pediría la aplicación que
  // falta — se perdería un tratamiento en curso sin que se note.
  const { jobs, loose } = groupIntoJobs(rows);

  // Las visitas que ya existen para esos clientes, para no duplicar historial
  // si el archivo se importa dos veces.
  const clientIds = [...new Set(rows.map((row) => row.clientId))];
  const existing = await db.visit.findMany({
    where: { ...tenantWhere(tenantId), clientId: { in: clientIds } },
    select: { id: true, clientId: true, scheduledAt: true, serviceType: true },
  });

  const existingKeys = new Set(
    existing
      .filter((visit) => visit.scheduledAt !== null)
      .map(
        (visit) =>
          `${visit.clientId}|${(visit.scheduledAt as Date).toISOString().slice(0, 10)}|${
            visit.serviceType ?? ''
          }`.toLowerCase()
      )
  );

  const outcome = await db.$transaction(async (tx) => {
    const importId = crypto.randomUUID();
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    const seen = new Set(existingKeys);
    let jobsCreated = 0;

    /** Escribe una visita. `jobId` la engancha a su tratamiento. */
    const writeVisit = async (row: ResolvedRow, jobId: string | null) => {
      const scheduledAt = row.values.scheduledAt as Date | undefined;
      if (!scheduledAt) return;

      const serviceType = (row.values.serviceType as string | undefined) ?? null;
      const key = `${row.clientId}|${scheduledAt
        .toISOString()
        .slice(0, 10)}|${serviceType ?? ''}`.toLowerCase();

      if (seen.has(key) && strategy !== 'CREATE_NEW') {
        skipped++;
        return;
      }

      // Sin estado mapeado, lo que ya pasó se da por hecho y lo que viene queda
      // por confirmar. Es la lectura que hace cualquiera de una planilla vieja.
      const status =
        (row.values.status as VisitStatus | undefined) ??
        (scheduledAt <= today ? 'COMPLETED' : 'PENDING_CONFIRM');

      try {
        await tx.visit.create({
          data: {
            tenantId,
            clientId: row.clientId,
            importId,
            jobId,
            applicationNumber: jobId
              ? ((row.values.applicationNumber as number | undefined) ?? null)
              : null,
            scheduledAt,
            serviceType,
            status,
            visitType:
              (row.values.visitType as 'CONTRACT' | 'SPECIAL' | undefined) ?? 'SPECIAL',
            price: (row.values.price as number | undefined) ?? 0,
            paymentStatus:
              (row.values.paymentStatus as 'PENDING' | 'PAID' | 'WAIVED' | undefined) ??
              'PENDING',
            notes: (row.values.notes as string | undefined) ?? null,
            completedAt: status === 'COMPLETED' ? scheduledAt : null,
          },
        });
        seen.add(key);
        imported++;
      } catch (error) {
        errors.push({
          row: row.row,
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    };

    for (const job of jobs) {
      const created = await tx.job.create({
        data: {
          tenantId,
          clientId: job.clientId,
          importId,
          serviceType: job.serviceType,
          // El tipo lo define la primera aplicación: un tratamiento es de abono
          // o especial entero, no mitad y mitad.
          visitType:
            (job.rows[0].values.visitType as 'CONTRACT' | 'SPECIAL' | undefined) ??
            'SPECIAL',
          totalApplications: job.totalApplications,
        },
      });
      jobsCreated++;

      for (const row of job.rows) await writeVisit(row, created.id);
    }

    for (const row of loose) await writeVisit(row, null);

    await tx.importHistory.create({
      data: {
        id: importId,
        tenantId,
        userId,
        entityType: 'visits',
        fileName,
        fileType: 'csv',
        totalRows,
        importedRows: imported,
        skippedRows: skipped,
        errorRows: errorRows + errors.length,
        errors: errors as unknown as Prisma.InputJsonValue,
        columnMapping,
        duplicateStrategy: strategy,
        status: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
        completedAt: new Date(),
      },
    });

    return {
      importId,
      imported,
      updated: 0,
      skipped,
      failed: errors.length,
      errors,
      jobsCreated,
    };
  });

  await recordAudit({
    tenantId,
    userId,
    action: 'IMPORT',
    entityType: 'visit',
    entityId: outcome.importId,
    changes: {
      importadas: outcome.imported,
      omitidas: outcome.skipped,
      fallidas: outcome.failed,
      trabajos: outcome.jobsCreated,
    },
  });

  return outcome;
};

/**
 * Deshace una importación: borra lógicamente solo las filas que creó.
 *
 * Deliberadamente **no** revierte los `UPDATE`: no guardamos el estado previo,
 * así que "deshacer" un update sería inventar datos. La UI lo dice.
 */
export const rollbackImport = async ({
  tenantId,
  userId,
  importId,
}: {
  tenantId: string;
  userId: string;
  importId: string;
}) => {
  const record = await db.importHistory.findFirst({
    where: { id: importId, ...tenantOnly(tenantId) },
    select: { id: true, status: true, entityType: true },
  });
  if (!record) return null;
  if (record.status === 'ROLLED_BACK') return { deleted: 0, alreadyRolledBack: true };

  const result = await db.$transaction(async (tx) => {
    const where = { ...tenantWhere(tenantId), importId };
    const data = { deletedAt: new Date() };

    let deleted: { count: number };
    if (record.entityType === 'visits') {
      deleted = await tx.visit.updateMany({ where, data });
      // Y los trabajos que se hayan inferido en ese mismo lote: sin sus visitas
      // quedarían pidiendo aplicaciones de un tratamiento que ya no existe.
      await tx.job.updateMany({ where, data });
    } else {
      deleted = await tx.client.updateMany({ where, data });
    }

    await tx.importHistory.update({
      where: { id: importId },
      data: { status: 'ROLLED_BACK' },
    });

    return { deleted: deleted.count, alreadyRolledBack: false };
  });

  await recordAudit({
    tenantId,
    userId,
    action: 'IMPORT',
    entityType: record.entityType === 'visits' ? 'visit' : 'client',
    entityId: importId,
    changes: { deshecha: true, eliminados: result.deleted },
  });

  return result;
};
