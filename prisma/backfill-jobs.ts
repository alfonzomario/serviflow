/**
 * One-shot backfill: turns the old inferred multi-visit jobs into real `Job`
 * rows.
 *
 * Before the Job model, a job existed only as a repeated shape across its
 * visits: same client, same `total_applications`, same originating request.
 * This reproduces exactly that grouping and writes one Job per group, pointing
 * every visit in the group at it.
 *
 * ```bash
 * npx tsx prisma/backfill-jobs.ts
 * ```
 *
 * Written in raw SQL on purpose. It reads two columns that the schema no longer
 * declares (`visits.total_applications`, `visits.follow_up_closed`), so going
 * through the Prisma client would mean this file stops compiling the moment the
 * migration it performs is complete. It checks for those columns first and says
 * so when they are already gone.
 *
 * Idempotent twice over: it only looks at visits with no `job_id` yet, and it
 * no-ops entirely once the old columns are dropped. Safe to re-run.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hasLegacyColumns = async (): Promise<boolean> => {
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
    FROM information_schema.columns
    WHERE table_name = 'visits'
      AND column_name IN ('total_applications', 'follow_up_closed')
  `;
  return Number(rows[0]?.count ?? 0) === 2;
};

async function main() {
  if (!(await hasLegacyColumns())) {
    console.log(
      'Las columnas viejas ya no existen: la migración a Trabajo ya se hizo. Nada que hacer.'
    );
    return;
  }

  // One Job per legacy group. `visit_type` and `service_type` come from the
  // earliest visit of the group — the one that named the work. A group is
  // considered closed if any of its visits carried the old per-visit flag.
  const created = await prisma.$executeRawUnsafe(`
    WITH groups AS (
      SELECT
        tenant_id,
        client_id,
        request_id,
        total_applications,
        bool_or(follow_up_closed)                                    AS closed,
        (array_agg(service_type ORDER BY created_at)
           FILTER (WHERE service_type IS NOT NULL))[1]               AS service_type,
        (array_agg(visit_type ORDER BY created_at))[1]               AS visit_type
      FROM visits
      WHERE job_id IS NULL
        AND total_applications > 1
        AND deleted_at IS NULL
      GROUP BY tenant_id, client_id, request_id, total_applications
    )
    INSERT INTO jobs (
      id, tenant_id, client_id, request_id, service_type, visit_type,
      total_applications, closed_at, created_at, updated_at
    )
    SELECT
      gen_random_uuid(), tenant_id, client_id, request_id, service_type, visit_type,
      total_applications,
      CASE WHEN closed THEN now() ELSE NULL END,
      now(), now()
    FROM groups
  `);

  // Point every visit at the job matching its own legacy key. The join is on
  // the same four columns the grouping used, so each visit finds exactly one.
  const linked = await prisma.$executeRawUnsafe(`
    UPDATE visits v
    SET job_id = j.id
    FROM jobs j
    WHERE v.job_id IS NULL
      AND v.total_applications > 1
      AND v.deleted_at IS NULL
      AND j.tenant_id = v.tenant_id
      AND j.client_id = v.client_id
      AND j.total_applications = v.total_applications
      AND j.request_id IS NOT DISTINCT FROM v.request_id
  `);

  console.log(`Migradas ${linked} visitas en ${created} trabajos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
