import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantOnly, tenantWhere } from '../../lib/tenant-context';
import {
  autoMapColumns,
  parseDelimited,
  resolveClientRefs,
  validateRows,
  type PreparedRow,
} from '../../services/import';
import {
  executeClientImport,
  executeNoteImport,
  executeRequestImport,
  executeTransactionImport,
  executeUserImport,
  executeVisitImport,
  rollbackImport,
} from '../../services/import.service';
import {
  configFor,
  ENTITIES,
  signaturesFor,
  type ImportEntity,
} from '../../lib/import/signatures';
import { TRPCError } from '@trpc/server';
import { db } from '../../db';
import type { Prisma } from '@prisma/client';

/**
 * Importación de datos.
 *
 * El archivo se manda como texto, no como upload: el navegador lo lee y acá
 * llega el contenido. Evita toda la infraestructura de subida y almacenamiento
 * para algo que se procesa una vez y se descarta.
 *
 * Está bajo el módulo `settings` con acción `write`: traer la base de un negocio
 * es una operación de dueño, no algo que haga un operador.
 */

const EntityEnum = z.enum([
  'clients',
  'visits',
  'transactions',
  'requests',
  'notes',
  'users',
]);
const StrategyEnum = z.enum(['SKIP', 'UPDATE', 'CREATE_NEW']);

const MappingSchema = z.object({
  sourceColumn: z.string(),
  sourceIndex: z.number().int().min(0),
  targetField: z.string().nullable(),
  confidence: z.enum(['auto', 'manual', 'none']),
});

// 5 MB de CSV son del orden de 50.000 filas de clientes: más que suficiente,
// y evita que un archivo enorme quede colgado en memoria.
const MAX_CONTENT = 5_000_000;

/**
 * Engancha las filas con sus clientes cuando la entidad lo necesita. Devuelve
 * null para las entidades que no cuelgan de nadie, como clientes.
 */
const resolveForEntity = async (
  tenantId: string,
  entity: ImportEntity,
  rows: PreparedRow[]
) => {
  const config = configFor(entity);
  if (!config.clientNameField) return null;

  const clients = await db.client.findMany({
    where: tenantWhere(tenantId),
    select: { id: true, name: true, externalId: true },
  });

  const resolution = resolveClientRefs({
    rows,
    clients,
    clientNameField: config.clientNameField,
    clientExternalIdField: config.clientExternalIdField,
  });

  // Donde el cliente es opcional, no encontrarlo no descarta la fila: entra sin
  // enganche. Los nombres siguen reportándose para que se puedan corregir.
  return { ...resolution, clientRequired: config.clientRequired === true };
};

export const importRouter = router({
  /** Las entidades importables, para el selector del primer paso. */
  entities: permissionProcedure('settings', 'write').query(() =>
    (Object.keys(ENTITIES) as (keyof typeof ENTITIES)[]).map((key) => ({
      entity: key,
      label: ENTITIES[key].label,
      description: ENTITIES[key].description,
    }))
  ),

  /** Los campos disponibles, para armar los selectores del mapeo. */
  fields: permissionProcedure('settings', 'write')
    .input(z.object({ entity: EntityEnum }))
    .query(({ input }) =>
      signaturesFor(input.entity).map((sig) => ({
        field: sig.field,
        label: sig.label,
        type: sig.type,
        required: sig.required ?? false,
        hint: sig.hint ?? null,
      }))
    ),

  /** Paso 1→2: lee encabezados, propone el mapeo y devuelve una muestra. */
  analyze: permissionProcedure('settings', 'write')
    .input(
      z.object({
        entity: EntityEnum,
        content: z.string().max(MAX_CONTENT),
      })
    )
    .mutation(({ input }) => {
      const { headers, rows } = parseDelimited(input.content);

      if (headers.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El archivo está vacío o no tiene encabezados',
        });
      }
      if (rows.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'El archivo tiene encabezados pero ninguna fila de datos',
        });
      }

      return {
        headers,
        totalRows: rows.length,
        mappings: autoMapColumns(headers, input.entity),
        sample: rows.slice(0, 5),
      };
    }),

  /** Paso 3→4: valida con el mapeo elegido y devuelve el resumen. */
  preview: permissionProcedure('settings', 'write')
    .input(
      z.object({
        entity: EntityEnum,
        content: z.string().max(MAX_CONTENT),
        mappings: z.array(MappingSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { rows } = parseDelimited(input.content);
      const result = validateRows({
        rows,
        mappings: input.mappings,
        entity: input.entity,
      });

      // Las visitas cuelgan de un cliente que tiene que existir. Resolverlo acá
      // y no al ejecutar es lo que permite avisar "estos 12 nombres no están"
      // antes de escribir nada.
      const resolution = await resolveForEntity(ctx.tenantId, input.entity, result.validRows);

      // Sin cliente obligatorio, las no resueltas cuentan como válidas.
      const dropped =
        resolution && resolution.clientRequired ? resolution.unmatched.length : 0;

      return {
        totalRows: result.totalRows,
        counts: { ...result.counts, valid: result.counts.valid - dropped },
        missingRequired: result.missingRequired,
        // Solo los primeros: una planilla con 2000 problemas no tiene por qué
        // viajar entera para mostrar una lista que nadie va a leer completa.
        issues: result.issues.slice(0, 100),
        totalIssues: result.issues.length,
        preview: (resolution?.resolved ?? result.validRows).slice(0, 20),
        droppedForMissingClient: dropped,
        unmatchedNames: resolution?.unmatchedNames.slice(0, 50) ?? [],
      };
    }),

  /** Paso 5: escribe. Vuelve a validar en el server — el cliente no es fuente de verdad. */
  execute: permissionProcedure('settings', 'write')
    .input(
      z.object({
        entity: EntityEnum,
        content: z.string().max(MAX_CONTENT),
        mappings: z.array(MappingSchema),
        strategy: StrategyEnum.default('SKIP'),
        fileName: z.string().max(255).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { rows } = parseDelimited(input.content);
      const result = validateRows({
        rows,
        mappings: input.mappings,
        entity: input.entity,
      });

      if (result.missingRequired.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Faltan campos obligatorios sin mapear: ${result.missingRequired.join(', ')}`,
        });
      }
      if (result.validRows.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No hay ninguna fila válida para importar',
        });
      }

      const common = {
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        strategy: input.strategy,
        fileName: input.fileName ?? null,
        columnMapping: input.mappings as unknown as Prisma.InputJsonValue,
        totalRows: result.totalRows,
      };

      if (input.entity === 'visits') {
        const resolution = await resolveForEntity(
          ctx.tenantId,
          'visits',
          result.validRows
        );

        if (!resolution || resolution.resolved.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Ninguna fila coincide con un cliente existente. Importá primero los clientes.',
          });
        }

        return executeVisitImport({
          ...common,
          rows: resolution.resolved,
          // Las filas sin cliente cuentan como no importadas, igual que las que
          // el motor descartó.
          errorRows: result.counts.errors + resolution.unmatched.length,
        });
      }

      if (input.entity === 'transactions') {
        const resolution = await resolveForEntity(
          ctx.tenantId,
          'transactions',
          result.validRows
        );

        return executeTransactionImport({
          ...common,
          // Las que no encontraron cliente entran igual, sin enganche.
          rows: [
            ...(resolution?.resolved ?? []),
            ...(resolution?.unmatched ?? []).map((row) => ({ ...row, clientId: null })),
          ],
          errorRows: result.counts.errors,
        });
      }

      if (input.entity === 'requests') {
        const resolution = await resolveForEntity(
          ctx.tenantId,
          'requests',
          result.validRows
        );

        if (!resolution || resolution.resolved.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Ninguna fila coincide con un cliente existente. Importá primero los clientes.',
          });
        }

        return executeRequestImport({
          ...common,
          rows: resolution.resolved,
          errorRows: result.counts.errors + resolution.unmatched.length,
        });
      }

      if (input.entity === 'notes') {
        return executeNoteImport({
          ...common,
          rows: result.validRows,
          errorRows: result.counts.errors,
        });
      }

      if (input.entity === 'users') {
        return executeUserImport({
          ...common,
          rows: result.validRows,
          errorRows: result.counts.errors,
        });
      }

      return executeClientImport({
        ...common,
        rows: result.validRows,
        errorRows: result.counts.errors,
      });
    }),

  history: permissionProcedure('settings', 'write').query(async ({ ctx }) => {
    return ctx.db.importHistory.findMany({
      where: tenantOnly(ctx.tenantId),
      orderBy: { startedAt: 'desc' },
      take: 30,
      include: { user: { select: { id: true, name: true } } },
    });
  }),

  /** Deshace un lote: borra lógicamente solo lo que esa importación creó. */
  rollback: permissionProcedure('settings', 'write')
    .input(z.object({ importId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await rollbackImport({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        importId: input.importId,
      });

      if (!result) throw new TRPCError({ code: 'NOT_FOUND' });
      if (result.alreadyRolledBack) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Esta importación ya se deshizo',
        });
      }

      return result;
    }),
});
