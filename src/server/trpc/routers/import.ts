import { router, permissionProcedure } from '../trpc';
import { z } from 'zod';
import { tenantOnly } from '../../lib/tenant-context';
import { autoMapColumns, parseDelimited, validateRows } from '../../services/import';
import { executeClientImport, rollbackImport } from '../../services/import.service';
import { signaturesFor } from '../../lib/import/signatures';
import { TRPCError } from '@trpc/server';
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

const EntityEnum = z.enum(['clients']);
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

export const importRouter = router({
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
    .mutation(({ input }) => {
      const { rows } = parseDelimited(input.content);
      const result = validateRows({
        rows,
        mappings: input.mappings,
        entity: input.entity,
      });

      return {
        totalRows: result.totalRows,
        counts: result.counts,
        missingRequired: result.missingRequired,
        // Solo los primeros: una planilla con 2000 problemas no tiene por qué
        // viajar entera para mostrar una lista que nadie va a leer completa.
        issues: result.issues.slice(0, 100),
        totalIssues: result.issues.length,
        preview: result.validRows.slice(0, 20),
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

      return executeClientImport({
        tenantId: ctx.tenantId,
        userId: ctx.session.user.id,
        rows: result.validRows,
        strategy: input.strategy,
        fileName: input.fileName ?? null,
        columnMapping: input.mappings as unknown as Prisma.InputJsonValue,
        totalRows: result.totalRows,
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
