import { db } from '../db';
import { tenantWhere, tenantOnly } from '../lib/tenant-context';
import { recordAudit } from './audit.service';
import type { PreparedRow } from './import';
import type { Prisma } from '@prisma/client';

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
    select: { id: true, status: true },
  });
  if (!record) return null;
  if (record.status === 'ROLLED_BACK') return { deleted: 0, alreadyRolledBack: true };

  const result = await db.$transaction(async (tx) => {
    const deleted = await tx.client.updateMany({
      where: { ...tenantWhere(tenantId), importId },
      data: { deletedAt: new Date() },
    });

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
    entityType: 'client',
    entityId: importId,
    changes: { deshecha: true, eliminados: result.deleted },
  });

  return result;
};
