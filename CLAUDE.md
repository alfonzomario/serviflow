# ServiFlow

Plataforma SaaS multi-tenant para negocios de servicios a domicilio. Nace de
portar una app de fumigación hecha en Google Apps Script (`legacy/`) a algo
vendible a cualquier rubro que trabaje igual: visitas recurrentes a domicilio de
clientes, más trabajos que llevan varias visitas.

**Empezá por `docs/estado.md`** — resume dónde está el proyecto, qué decisiones de
negocio ya están tomadas y qué sigue. Después `docs/implementation_plan.md` (el
plan maestro original) y `docs/task.md` (bitácora detallada de qué se desvió del
plan y por qué).

El plan maestro está desactualizado en varios puntos porque el negocio nos corrigió
sobre la marcha. Donde difieran, manda `docs/estado.md`.

## Entorno local

PostgreSQL corre en el **puerto 5433** (Homebrew `postgresql@17`), porque el 5432
lo ocupa una instalación de PostgreSQL 14 previa del sistema.

```bash
npm run dev          # http://localhost:3000
npm test             # vitest
npx tsc --noEmit     # typecheck
npx prisma db push   # aplicar cambios de schema
npx prisma db seed   # datos demo (idempotente)
```

Login demo: `owner@lozanor.com` / `demo1234`

## Comandos: uno por llamada, sin encadenar

Los permisos se evalúan contra el comando completo, así que encadenar rompe el
allowlist de `.claude/settings.json` y provoca un prompt por cada combinación:

```bash
# mal: empieza con `export`, no coincide con ninguna regla
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"; psql -h 127.0.0.1 -p 5433 ...

# bien: ruta completa, un solo comando
/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 5433 -d serviflow -c "..."
```

Lo mismo con `&&` y `;`: preferir varias llamadas separadas antes que una cadena.

Si un comando nuevo empieza a pedir permiso seguido, agregarlo al allowlist en
vez de dejar que interrumpa.

## Reglas de producto que no se negocian

- **La app nunca agenda sola.** Calcula, avisa y sugiere fechas; el turno lo pone
  siempre el usuario. Esto también limita al recomendador IA: propone, no reserva.
- **Pendientes es lo que falta *agendar***, no lo que falta hacer. Darle fecha lo
  saca (sea cual sea el estado), cancelar lo saca definitivo, y solo eliminar del
  calendario lo devuelve.
- **La cantidad de aplicaciones de un trabajo se carga a mano.** Nada de recetas
  por tipo de servicio: se dijo explícitamente que no se quieren.
- **Nada de vocabulario de fumigación hardcodeado.** Abono / Especial /
  Tratamiento son etiquetas por tenant (`TenantSettings.label*`). Usar
  `useTenantLabels()` en la UI.

## Dónde vive la lógica

`src/server/services/pending.ts` es una función pura sin Prisma, con 37 tests.
Toda regla de negocio de pendientes va ahí, no en el router ni en la página.
Agregar una variante de comportamiento = una rama más y un test por cada lado.

`src/server/lib/industries.ts` es el único archivo que conoce los rubros. Sumar
uno nuevo es una entrada más en ese array.

`src/server/services/import.ts` es el motor del importador: puro, sin Prisma, 49
tests. Los campos importables y sus alias viven en
`src/server/lib/import/signatures.ts` — sumar un campo es una entrada más ahí.
Regla: **nunca descartar una fila por un campo opcional**, entra sin ese dato.

Un trabajo multi-visita es una fila (`Job`); las visitas le pertenecen vía
`Visit.jobId`. El trabajo es la autoridad sobre cuántas aplicaciones son — no
volver a derivarlo agrupando visitas, que es de dónde venimos.
