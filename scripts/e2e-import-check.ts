/**
 * Prueba de punta a punta del importador contra la base real.
 *
 * Corre las tres entidades nuevas (solicitudes, notas, equipo), verifica lo que
 * quedó escrito y después deshace cada lote para comprobar que el rollback deja
 * la base como estaba. Es un script y no un test de vitest porque necesita
 * Postgres; se borra solo al terminar.
 *
 *   npx tsx scripts/e2e-import-check.ts
 */

import { db } from '../src/server/db';
import {
  autoMapColumns,
  parseDelimited,
  resolveClientRefs,
  validateRows,
} from '../src/server/services/import';
import {
  executeNoteImport,
  executeRequestImport,
  executeUserImport,
  rollbackImport,
} from '../src/server/services/import.service';
import { configFor, type ImportEntity } from '../src/server/lib/import/signatures';

const ok = (label: string, condition: boolean, detail = '') => {
  console.log(`${condition ? '  ok  ' : ' FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
};

const prepare = (csv: string, entity: ImportEntity) => {
  const { headers, rows } = parseDelimited(csv);
  const mappings = autoMapColumns(headers, entity);
  const result = validateRows({ rows, mappings, entity });
  return { mappings, result };
};

async function main() {
  // Se arranca por el owner y no por el tenant: el primer tenant es la
  // plataforma, que no tiene usuarios de negocio.
  const user = await db.user.findFirst({
    where: { role: 'OWNER' },
    select: { id: true, tenant: { select: { id: true, name: true } } },
  });
  if (!user) throw new Error('No hay owner. Corré npx prisma db seed.');
  const tenant = user.tenant;

  const client = await db.client.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) throw new Error('No hay clientes en el tenant demo.');

  console.log(`\nTenant: ${tenant.name}  ·  cliente de prueba: ${client.name}\n`);
  const common = {
    tenantId: tenant.id,
    userId: user.id,
    strategy: 'SKIP' as const,
    fileName: 'e2e.csv',
    columnMapping: {},
  };

  // ── Solicitudes ────────────────────────────────────────────────────────
  console.log('SOLICITUDES');
  const reqCsv = `Cliente,Servicios,Urgencia,Estado,Comentario,Fecha
${client.name},"Cucarachas; Roedores",urgente,abierta,Llamó por hormigas en la cocina,15/03/2026
Cliente Que No Existe,Roedores,normal,abierta,No debería entrar,16/03/2026`;

  const req = prepare(reqCsv, 'requests');
  ok('mapea las 6 columnas', req.mappings.filter((m) => m.targetField).length === 6);

  const reqClients = await db.client.findMany({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, externalId: true },
  });
  const reqResolved = resolveClientRefs({
    rows: req.result.validRows,
    clients: reqClients,
    clientNameField: configFor('requests').clientNameField!,
    clientExternalIdField: configFor('requests').clientExternalIdField,
  });
  ok('engancha 1 y deja 1 sin cliente', reqResolved.resolved.length === 1 &&
    reqResolved.unmatched.length === 1, `sin cliente: ${reqResolved.unmatchedNames.join(', ')}`);

  const reqOut = await executeRequestImport({
    ...common,
    rows: reqResolved.resolved,
    totalRows: req.result.totalRows,
    errorRows: req.result.counts.errors + reqResolved.unmatched.length,
  });
  ok('importó 1 solicitud', reqOut.imported === 1);

  const savedReq = await db.serviceRequest.findFirst({
    where: { importId: reqOut.importId },
    select: { urgency: true, status: true, serviceTypes: true, createdAt: true, clientName: true },
  });
  ok('urgencia HIGH', savedReq?.urgency === 'HIGH');
  ok('estado PENDING', savedReq?.status === 'PENDING');
  ok('dos servicios', savedReq?.serviceTypes.length === 2);
  ok('respetó la fecha del archivo', savedReq?.createdAt.getFullYear() === 2026 &&
    savedReq?.createdAt.getMonth() === 2 && savedReq?.createdAt.getDate() === 15);

  const reqAgain = await executeRequestImport({
    ...common,
    rows: reqResolved.resolved,
    totalRows: req.result.totalRows,
    errorRows: 0,
  });
  ok('reimportar no duplica', reqAgain.imported === 0 && reqAgain.skipped === 1);

  // ── Notas ──────────────────────────────────────────────────────────────
  console.log('\nNOTAS');
  const noteCsv = `Nota,Recordatorio,Fecha
"Revisar stock de cebo
antes del lunes",20/03/2026,10/03/2026
Llamar al proveedor,cuando se pueda,11/03/2026`;

  const note = prepare(noteCsv, 'notes');
  ok('las 2 filas entran', note.result.counts.valid === 2);
  ok('el recordatorio ilegible avisa, no rechaza',
    note.result.counts.errors === 0 && note.result.counts.warnings === 1);

  const noteOut = await executeNoteImport({
    ...common,
    rows: note.result.validRows,
    totalRows: note.result.totalRows,
    errorRows: note.result.counts.errors,
  });
  ok('importó 2 notas', noteOut.imported === 2);

  const multiline = await db.note.findFirst({
    where: { importId: noteOut.importId, content: { contains: 'cebo' } },
    select: { content: true, reminderAt: true },
  });
  ok('conservó el salto de línea', multiline?.content.includes('\n') === true);
  ok('guardó el recordatorio', multiline?.reminderAt !== null);

  // ── Equipo ─────────────────────────────────────────────────────────────
  console.log('\nEQUIPO');
  const userCsv = `Nombre,Email,Rol
Juan Pérez,juan.e2e@lozanor.com,técnico
Marta Gómez,marta.e2e@lozanor.com,encargado
Roto,no-es-un-email,operario`;

  const usr = prepare(userCsv, 'users');
  ok('rechaza la fila del email inválido', usr.result.counts.errors === 1);
  ok('quedan 2 válidas', usr.result.counts.valid === 2);

  const usrOut = await executeUserImport({
    ...common,
    rows: usr.result.validRows,
    totalRows: usr.result.totalRows,
    errorRows: usr.result.counts.errors,
  });
  ok('importó 2 usuarios', usrOut.imported === 2);

  const imported = await db.user.findMany({
    where: { importId: usrOut.importId },
    select: { email: true, role: true, isActive: true, passwordHash: true },
    orderBy: { email: 'asc' },
  });
  ok('todos desactivados', imported.every((u) => !u.isActive));
  ok('roles bien mapeados',
    imported.find((u) => u.email.startsWith('juan'))?.role === 'OPERATOR' &&
    imported.find((u) => u.email.startsWith('marta'))?.role === 'ADMIN');
  ok('las contraseñas son hashes distintos entre sí',
    imported[0].passwordHash !== imported[1].passwordHash &&
    imported.every((u) => u.passwordHash.startsWith('$2')));

  const existingEmail = await db.user.findFirst({
    where: { tenantId: tenant.id, importId: null },
    select: { email: true, passwordHash: true },
  });
  const dupOut = await executeUserImport({
    ...common,
    rows: prepare(
      `Nombre,Email,Rol\nImpostor,${existingEmail!.email},dueño`,
      'users'
    ).result.validRows,
    totalRows: 1,
    errorRows: 0,
  });
  ok('nunca pisa a un usuario que ya existe', dupOut.imported === 0 && dupOut.skipped === 1);
  const untouched = await db.user.findFirst({
    where: { tenantId: tenant.id, email: existingEmail!.email },
    select: { passwordHash: true },
  });
  ok('la contraseña del existente quedó intacta',
    untouched?.passwordHash === existingEmail!.passwordHash);

  // ── Deshacer ───────────────────────────────────────────────────────────
  console.log('\nDESHACER');
  const rbReq = await rollbackImport({ tenantId: tenant.id, userId: user.id, importId: reqOut.importId });
  ok('borra la solicitud', rbReq?.deleted === 1);
  ok('no queda ninguna', (await db.serviceRequest.count({ where: { importId: reqOut.importId } })) === 0);

  const rbNote = await rollbackImport({ tenantId: tenant.id, userId: user.id, importId: noteOut.importId });
  ok('borra las 2 notas', rbNote?.deleted === 2);
  ok('quedan con deletedAt',
    (await db.note.count({ where: { importId: noteOut.importId, deletedAt: null } })) === 0);

  const rbUsr = await rollbackImport({ tenantId: tenant.id, userId: user.id, importId: usrOut.importId });
  ok('borra los 2 usuarios sin uso', rbUsr?.deleted === 2);
  ok('no quedan en la base',
    (await db.user.count({ where: { importId: usrOut.importId } })) === 0);

  const rbTwice = await rollbackImport({ tenantId: tenant.id, userId: user.id, importId: usrOut.importId });
  ok('deshacer dos veces no rompe', rbTwice?.alreadyRolledBack === true);

  // Limpieza de los lotes que quedaron por las reimportaciones de duplicados.
  for (const id of [reqAgain.importId, dupOut.importId]) {
    await rollbackImport({ tenantId: tenant.id, userId: user.id, importId: id });
  }
  await db.importHistory.deleteMany({
    where: { tenantId: tenant.id, fileName: 'e2e.csv' },
  });

  console.log(
    process.exitCode ? '\nHubo fallas.\n' : '\nTodo bien. Base limpia.\n'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
