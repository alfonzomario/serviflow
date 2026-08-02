> **Para retomar el trabajo, leer `docs/estado.md` primero.** Este archivo es la
> bitácora detallada: qué se hizo, qué se desvió del plan y por qué. Sirve para
> entender decisiones puntuales, no como punto de entrada.

# ServiFlow - Phase 1: Foundation

## Current Sprint: Project Setup & Core Architecture ✅

### Foundation (Config & DB)
- [x] package.json, tsconfig, next.config, tailwind, postcss
- [x] Prisma schema (complete with all 12 tables + enums)
- [x] Environment variables template (.env.example)
- [x] i18n setup (Spanish + English - messages/es.json, messages/en.json)
- [x] globals.css (design system with CSS variables, animations)
- [x] .gitignore
- [x] README.md
- [x] Database seed script (prisma/seed.ts)

### Backend Architecture
- [x] Auth.js v5 configuration (credentials provider + JWT + session)
- [x] Auth edge config (auth.config.ts for middleware)
- [x] tRPC setup (context, trpc.ts with middleware layers)
- [x] Permission engine (RBAC - permissions.ts)
- [x] Tenant isolation middleware (tenant-context.ts)
- [x] Date utilities (date-utils.ts with timezone support)
- [x] Visit service (status machine, finance sync, pendientes SQL queries)
- [x] Geo service (Haversine distance, distance matrix)
- [x] tRPC routers: auth, clients, visits
- [x] tRPC root router
- [x] tRPC client-side setup (lib/trpc.ts)
- [x] API routes: /api/auth, /api/trpc

### Phase 1: Foundation (COMPLETED)

- [x] Create Next.js 15 project with tRPC, Prisma, Auth.js, and Tailwind CSS v4.
- [x] Configure multi-tenant database schema (`Tenant`, `User`, `Client`, `Visit`, etc.).
- [x] Set up i18n routing for English and Spanish.
- [x] Implement robust RBAC middleware (Super Admin, Admin, Operator, Client).
- [x] Create core UI shell (sidebar, topbar, mobile responsiveness).
- [x] Push schema to PostgreSQL and seed initial demo data.
- [x] Auth layout (gradient background, centered card)
- [x] Login page (form, signIn integration)
- [x] Register page (business registration)
- [x] Dashboard layout (sidebar + header, responsive)
- [x] Dashboard home page (KPI cards)
- [x] Sidebar component (role-based nav, icons, groups)
- [x] Header component (search, notifications, user dropdown)
- [x] KPICard component (gradient, trend indicator)
- [x] StatusBadge component (visit status colors)
- [x] PaymentBadge component
- [x] EmptyState component
- [x] LoadingSkeleton component (shimmer animation)
- [x] shadcn/ui: Button, Input, Card, Badge, Label

### Post-Build Fixes
- [x] Fix auth.ts: passwordHash field name (was `password`)
- [x] Fix auth.ts: tenant status check (enum vs boolean)
- [x] Rewrite visit.service.ts with real SQL queries for pendientes
- [x] Add finance auto-sync on visit completion

### Build Blockers Resolved
- [x] `src/lib/trpc.ts` → `.tsx` (contained JSX, broke type checking)
- [x] Wire SessionProvider + TRPCProvider + NextIntlClientProvider + Toaster in root layout
- [x] `clients` router used a non-existent `type` field → `relationshipType`
- [x] `visits` router enum had `IN_PROGRESS` (not in schema) and lacked `SKIPPED`
- [x] `auth.register` wrote `password` and omitted the required unique `slug`
- [x] Removed broken `withTenantScope` Prisma extension; added `tenantOnly()` for
      models that have no `deleted_at` (ServiceRequest, User, TenantSettings…)
- [x] JWT module augmentation targeted `@auth/core/jwt` → `next-auth/jwt`
- [x] i18n: `localePrefix: 'never'` (the app tree has no `[locale]` segment, so the
      old middleware redirected `/` to a non-existent `/es`)
- [x] Middleware now enforces auth instead of locale routing
- [x] Login and register pages were `setTimeout` mocks → real `signIn` / `auth.register`

### Phase 2: Feature Implementation

#### Scheduling & Agenda
- [x] Install FullCalendar and date libraries.
- [x] Implement `src/app/(dashboard)/agenda/page.tsx`
- [x] Connect `trpc.visits.list` to populate calendar
- [x] Create 'Add Visit' dialog component (`components/agenda/VisitForm.tsx`)
- [x] Implement drag-and-drop rescheduling (`visits.reschedule`, reverts on error,
      COMPLETED visits are locked)

#### tRPC Routers
- [x] requests (list, counts, create, update, **schedule → visit**, close, delete)
- [x] transactions (list + summary, monthlySummary, CRUD)
- [x] notes (list, dueReminders, CRUD)
- [x] users (list, assignable, create, update, resetPassword, deactivate)
- [x] tenant (current, updateProfile, updateSettings, serviceTypes)
- [x] dashboard (kpis, upcomingVisits)

#### Pages
- [x] Clients CRUD with debounced search, vínculo/estado filters, pagination
- [x] **Client detail** `/clients/[clientId]` — profile, stats, visit history, requests
- [x] Requests workflow with status tabs and request → visit conversion
- [x] Dashboard wired to real KPIs (was hardcoded placeholder data)

#### UI primitives added
- [x] dialog, select, textarea, table
- [x] `ConfirmDialog` — the plan asks for a dialog, not `window.confirm`
- [x] `lib/format.ts` (currency, dates, phone), `hooks/useDebounce`, `hooks/usePermissions`

### Plan Compliance Fixes

Reconciled against `docs/implementation_plan.md` after a full read:

- [x] **Permission engine rewritten to the plan's matrix.** It was reading
      `users.permissions` as a flat `"module.action"` string array, but the plan
      defines a nested object (`{ agenda: {read, write}, …, ai: {read},
      archive: {execute} }`) and the schema defaults it to `{}` — so **ADMIN could
      never pass any check**. Added `parsePermissions`, `MODULE_ACTIONS`, and a
      `permissionProcedure(module, action)` tRPC helper.
- [x] **visits and notes routers had no permission checks at all** — every
      procedure across visits/notes/clients/requests/transactions is now gated.
- [x] Sidebar filters by the permission matrix instead of a hardcoded role list,
      so the nav matches what the API will actually allow.
- [x] **Added the `plans` table** the plan defines (max_users, max_clients,
      ai_enabled, calendar_sync, custom_branding, api_access, prices) with
      `Subscription.planId` FK, seeded with Free / Pro / Business.
- [x] **`audit_logs` had no writer.** Added `audit.service.ts` and wired it into
      visit status changes and the client/visit/transaction deletes.

### Pendientes — reworked against the legacy behaviour

The first version implemented the simplified SQL from the plan. Reading
`buildPendientesItems` in `legacy/index.html` showed it was materially wrong.

**The model: pendientes is a queue of things left to SCHEDULE**, not a "not done
yet" report:

| Action on a visit | Effect on pendientes |
|---|---|
| Given a date | leaves, whatever the status |
| Completed | leaves |
| Cancelled | leaves for good, stays on record as cancelled |
| **Deleted from the calendar** | **comes back** — the only way something returns |

Rules implemented in `server/services/pending.ts` (pure, no Prisma, unit-tested):

- **Abonos carry over.** An uncovered month keeps showing, flagged
  "N meses sin hacer, desde <month>". A client with no visit history at all is
  *not* reported as overdue — there is no evidence the contract was running.
- **Only CONTRACT visits fulfil the monthly abono**, so a one-off special job for
  the same client no longer silences it. Required a new `Visit.visitType`.
- **Only the next application** of a treatment is surfaced, never the whole tail
  (the legacy comment calls these "2das/3ras visitas fantasma").
- **Treatments are grouped** by `clientId|totalApplications|requestId`, so two
  concurrent treatments for one client stay separate.
- **`followUpClosed`** ends a treatment early.
- Third category the plan omitted entirely: **visits filed without a slot**.

Deviation from the legacy code, on your instruction: legacy dropped CANCELLED
visits from the treatment group, which made a cancelled application *reappear* as
missing. Here CANCELLED closes it.

Schema changes this required:
- `Visit.scheduledAt` is now **nullable** — a visit can exist before it has a slot
- `Visit.visitType` (`CONTRACT` | `SPECIAL`)
- `Visit.followUpClosed`

Scheduling from a Pendientes row carries its context through to the visit form
(application number, treatment's requestId, CONTRACT type), otherwise the new
visit would not belong to the treatment and the pendiente would never clear.

- [x] **Pendientes** page rebuilt around the three categories, with month
      navigation, overdue badge and one-click scheduling.
- [x] **Finanzas** — ledger with month/type filters, income/expense/balance cards,
      6-month chart, transaction CRUD.
- [ ] Historial (archivado por año)
- [ ] Notas y alarmas + cron de reminders
- [ ] Gestión de equipo (router `users` ya está listo)

### Bugs found and fixed while verifying
- [x] `Transaction.transactionDate` is a Postgres `DATE`; Prisma returns UTC
      midnight, so rendering it in UTC-3 showed **the previous day**. Added
      `formatDateOnly` / `toDateOnlyInputValue` and the form now submits UTC midnight.
- [x] Finance chart bars had zero height (`h-full` on a flex child) and the series
      skipped months with no movements — now `min-h-0 flex-1` and a zero-filled series.
- [x] Sidebar rendered an empty nav while the session was loading — now a skeleton.

### Local environment
- [x] `npm install`, `prisma db push`, `prisma db seed` (seed is now idempotent and
      creates demo visits + the matching income transaction)
- [x] Postgres runs on **port 5433** (Homebrew postgresql@17) because port 5432 is
      taken by a pre-existing system PostgreSQL 14 install

### Verified end-to-end in the browser
Login → drag-and-drop reschedule (persisted) → client create → request → scheduled
visit (linked by `request_id`) → visit marked COMPLETED → **income transaction
auto-created** and audit log written.

### Generalising beyond fumigation

The point of the rewrite is selling to any rubro that works like the fumigation
business, not porting one business's habits. Two things were still fumigation-
shaped and got fixed:

**Recurrence was hardcoded to "one visit per calendar month".** That works for a
monthly abono and for nothing else — pools are weekly, water tanks are
semi-annual, gardening is fortnightly. It also had a bug inherited from the
month model: fumigating on 31 Jan and 1 Feb counted as two covered months.

Recurrence is now `unit` (DAY/WEEK/MONTH) + `interval`, defaulted per tenant and
overridable per client. Pendientes computes a **due date** from the last visit
plus the cadence, instead of asking whether the calendar month has a visit.
Overdue is reported in days against that due date. `addCadence` walks the
calendar for months so a monthly service keeps its day number, and clamps
31 Jan + 1 month to 28/29 Feb rather than sliding into March.

**The 15-day rule between applications did not exist as data.** In the legacy app
it is a sentence inside the AI prompt (`legacy/code.gs:1816`) — schedule manually
and nothing stops you. It is now `TenantSettings.minDaysBetweenApplications`,
overridable per client, and it drives two things:

- Pendientes shows "Hacerla a partir del <fecha>" and dims the row while it is
  not yet due
- The visit form warns when a date falls short, and never blocks the save

**Nothing is ever scheduled automatically.** Confirmed as a product rule: the app
computes, reminds, suggests and warns; the write that assigns a date always comes
from an explicit user action. This also constrains the planned AI recommender.

### What is configurable, and what is not

Deliberate position: **full customisation is a trap** — it hands the modelling
work to the customer and makes every support case unique. Instead a small set of
behaviour toggles, each defaulted by the industry preset, so most customers never
open the screen.

Configurable, because rubros genuinely differ:

| Toggle | Default (fumigación) | The other branch |
|---|---|---|
| `recurrenceAnchor` | `CALENDAR` — "el abono de agosto"; any visit in the period settles it and the next is owed from day 1 | `LAST_VISIT` — go on the 20th, next due the 20th (pools, gardening) |
| `oneOffSettlesPeriod` | `false` — an emergency call does not replace the commitment | `true` — if you went and did the work, the period is covered |
| `recurrenceUnit` + `recurrenceInterval` | monthly | weekly, fortnightly, semi-annual, annual |
| `minDaysBetweenApplications` | 15 | 0 where there is no technical wait |
| The three labels | Abono / Especial / Tratamiento | Plan de mantenimiento / Trabajo puntual / Trabajo, etc. |

Deliberately **not** configurable:

- **"Only the next application"** — the legacy comment states it exists to avoid
  "2das/3ras visitas fantasma". That is learned wisdom, not a preference.
- **"Never schedule automatically"** — a product rule; it defines what the app is.
- **Cancelled settles, deleted returns** — confirmed as universal, not a fork.

This stays cheap to extend because the logic is a pure function with 37 tests:
a new toggle is one branch plus a test for each side.

### Settling a period without visiting

"Saldar" records a `SKIPPED` visit for the period. That closes the commitment,
advances the due date to the next period, and stays honest in the client's
history. Deleting that row brings the pendiente back, exactly like any other
visit. It mirrors the legacy `OMITIDA_MES` instead of inventing a parallel
concept. A settled period is excluded from "última visita", since nobody visited.

### Onboarding wizard with industry presets

`server/lib/industries.ts` holds the catalogue — fumigación, piletas, tanques,
jardinería, climatización, matafuegos, limpieza, plus Custom. Each preset seeds
cadence, minimum gap, service types, visit duration, working hours and the two
domain labels (what the rubro calls its recurring agreement and its multi-visit
jobs).

Picking an industry **locks nothing**: every value is editable in the wizard
itself and afterwards from Settings. Adding a rubro is a single entry in that
file, which is the cheapest way to make the product feel native to a new market.

The dashboard layout redirects to `/onboarding` until `TenantSettings.onboardedAt`
is set.

### Tests
- [x] First test suite: `pending.test.ts`, 42 cases covering carry-over, sequence
      gating, cancelled-vs-deleted, job grouping and closing.
      Run with `npm test`. It already caught one design bug (a never-visited
      contract being reported as months overdue).
- [ ] Nothing else is covered yet — the plan's Verification Plan also wants
      integration tests and Playwright E2E.

### Settings page and per-client overrides

The wizard promised "podés cambiar cualquier cosa desde Ajustes" while that page
did not exist — a promise the shipped UI broke. `/settings` now covers business
profile, cadence, anchor, the one-off toggle, minimum gap, the three labels,
working hours, base address and service types.

`ClientForm` gained an optional "este cliente es distinto" section for the
per-client cadence and gap overrides. Blank means inherit the business default;
Radix Select needs a sentinel value for that, since it cannot hold `""`.

### Trabajo/Job as a first-class entity

The multi-visit job is now a row (`Job`) instead of a shape inferred from its
visits. `Visit.jobId` points at it; `Visit.totalApplications` and
`Visit.followUpClosed` are gone.

What the old grouping (`clientId|totalApplications|requestId`) could not do, and
now works:

- **Change the number of applications mid-job.** The old key *contained* the
  total, so raising it split the job in two: the visits already booked kept the
  old total and formed a phantom group that kept asking for its own next
  application. Now the job row is the single authority. Lowering it below what
  is already scheduled simply stops asking, and deletes nothing.
- **Open a job before its first visit.** A job used to exist only through its
  visits, so "3 aplicaciones, todavía ninguna agendada" was unrepresentable.
  Pendientes now asks for application 1.
- **Close a job.** `followUpClosed` was a per-visit boolean with no UI;
  `Job.closedAt` has a button in Pendientes and on the client detail page, plus
  reopen.

The count is still typed in by hand — no recipes per service type, as decided.

Migration ran in three steps (`prisma/backfill-jobs.ts` documents it): push the
additive schema, backfill one Job per legacy group, then drop the two old
columns. The script is raw SQL so it still compiles after the columns it reads
are gone, and it no-ops if re-run.

Multi-visit jobs can now be started from the agenda (`VisitForm`) and from a
request (`ScheduleRequestDialog`), not only by hand in the seed.

### Notas, Equipo e Historial — y el nav sin links muertos

El sidebar linkeaba a cinco rutas inexistentes (`/notes`, `/team`, `/history`,
`/ai`, `/import`). Como OWNER bypassa la matriz de permisos, las veía las cinco
y las cinco daban 404.

Tres se construyeron; las otras dos salieron del nav hasta que existan. Un link a
un 404 es peor que no tener el link.

**Notas** — CRUD sobre el router que ya estaba, filtro por recordatorio, y
"archivar" (`markReminderSent`) para sacar un vencido de la lista sin borrarlo.

**Equipo** — alta, edición, reset de contraseña y desactivación. El editor de la
matriz de permisos aparece **solo para ADMIN**, que es el único rol que la
resuelve; para los demás sería un formulario que no cambia nada. Mantiene
coherente el par ver/editar, respetando qué acciones soporta cada módulo (`ai`
es read-only, `archive` execute-only). El toggle "puede iniciar sesión" existe
porque el diálogo de desactivación promete que se puede reactivar editando.

**Historial** — router nuevo (`history.ts`). `recordAudit` venía escribiendo en
`audit_logs` desde el principio **sin nadie del otro lado**. Append-only a
propósito: no hay create, update ni delete.

Dos huecos que aparecieron al construirlo:

- **`users` no auditaba nada.** Los cambios de rol y de permisos son lo más
  sensible de la app y no dejaban rastro. Ahora se registran alta, cambio de rol,
  cambio de permisos, reset de contraseña y desactivación — nunca la contraseña
  ni su hash, solo que el reset ocurrió. Un rename no genera entrada.
- **`LOGIN`, `SCHEDULE`, `IMPORT` y `ARCHIVE` no las escribe nadie.** Están fuera
  del filtro: una opción que nunca puede dar resultados se lee como un bug.

### Importador de datos (Fase 5)

El wizard self-service del plan, funcionando para clientes: CSV → mapeo
automático → preview → importar → deshacer.

**El archivo no se sube.** El navegador lo lee y manda el texto por tRPC. Se
procesa una vez y se descarta, así que montar almacenamiento de archivos habría
sido infraestructura para nada.

**`import.ts` es puro y tiene 49 tests**, misma división que `pending.ts` /
`visit.service.ts`: ahí está el riesgo, así que tiene que probarse sin base.

Decisiones que vinieron de mirar planillas reales, no de la spec:

- **Separador autodetectado.** Excel en español exporta con `;` porque la coma
  es el decimal. Asumir `,` metía la planilla entera en una columna.
- **Se saca el BOM** que Excel pone al principio: se pegaba al primer encabezado
  y rompía el auto-mapeo.
- **Números en los dos formatos.** "1.234,56" y "1,234.56". Con un solo
  separador seguido de tres dígitos se asume miles, que es lo que hace que
  "1.500" sea mil quinientos.
- **Fechas dd/MM salvo que sea imposible.** "03/13" se lee MM/dd porque 13 no es
  mes; "03/04" se lee 3 de abril. Y "31/02" se rechaza en vez de dejar que
  `Date` haga rollover a marzo e importe un dato inventado.
- **Un campo no se mapea a dos columnas.** Con "Teléfono" y "Teléfono
  alternativo", el exacto gana y el otro queda sin mapear para que decida el
  usuario, en vez de pisarlo en silencio.

**Duplicados** por nombre + dirección normalizados — solo el nombre daba
demasiados falsos positivos. Tres estrategias: omitir, actualizar (completa lo
que falta; una celda vacía no borra lo que había) o crear igual. Los existentes
se leen una sola vez: un `findFirst` por fila convertía 2000 clientes en 2000
consultas.

**Deshacer** borra lógicamente solo lo que ese `importId` creó. **No revierte
los UPDATE**: no guardamos el estado previo, así que deshacerlos sería inventar
datos. El diálogo lo dice.

Probado de punta a punta con un CSV sucio a propósito (separador `;`, comillas
escapadas, `s/d` de teléfono, email `jose@`, fila sin nombre, duplicado interno,
enum inventado): 5 creados, 1 omitido, 1 descartada, y las filas con dato feo
entraron sin ese dato. Reimportar el mismo archivo con SKIP no duplicó nada, y
deshacer devolvió la base al estado inicial.

### Importación de visitas

El importador ya trae historial, no solo la cartera. Eso arregla algo concreto:
`pending.ts` marca como pendiente a todo contrato sin visitas previas, con
`dueAt = hoy`. Es deliberado y está tested ("no hay evidencia de que el abono
existiera antes"), pero significa que quien importaba 200 clientes con abono
abría Pendientes y veía 200 items venciendo el día uno. Con historial importado
eso baja solo — verificado contra la base: `recurring` 1 → 0.

**Enganche por nombre exacto normalizado, sin matching difuso.** Adivinar sería
peor que fallar: una visita colgada del cliente equivocado no rompe nada visible
en el momento pero corrompe Pendientes en silencio, saldándole el período a
quien no corresponde. La fila se rechaza y se listan los nombres que no
aparecieron. Dos clientes con el mismo nombre normalizado hacen que ambos salgan
del índice, así que esas filas caen como "no encontrado" en vez de elegir una al
azar.

`resolveClientRefs` se mantuvo pura recibiendo los clientes como parámetro, así
el preview puede avisar "estas 12 filas no tienen cliente" antes de escribir
nada.

**Las visitas importadas no generan transacciones** ni pasan por
`onVisitStatusChange`. Son historial, no trabajo recién completado: importar dos
años de visitas cobradas habría inventado dos años de ingresos con fecha de hoy
y dejado Finanzas sin sentido. Verificado — el contador de transacciones no se
movió.

Sin estado mapeado, lo que ya pasó entra como `COMPLETED` y lo que viene como
`PENDING_CONFIRM`, que es cómo lee cualquiera una planilla vieja.

Las firmas pasaron de una lista de campos a un `EntityConfig` por entidad, con
sus campos de deduplicación. Sumar una entidad sigue siendo una entrada más.

### Importar tratamientos, no solo visitas sueltas

Una planilla con "aplicación 2 de 3" entraba como visitas sin `Job`, así que
Pendientes nunca pedía la aplicación faltante: un tratamiento en curso se perdía
sin que se note. Ahora esas filas se agrupan y se persiste un `Job` real.

`groupIntoJobs` agrupa por cliente + servicio + total, y corta cuando la
secuencia vuelve a empezar (aparece un número menor o igual al anterior) o
cuando el trabajo ya se completó. Eso separa dos tratamientos iguales del mismo
cliente en fechas distintas sin inventar ventanas de tiempo arbitrarias —
verificado con dos tratamientos de Hormigas del mismo cliente, enero y mayo, que
quedaron como dos trabajos.

Vale aclarar por qué esto no es volver atrás: la clave de agrupamiento es la
misma que sacamos del runtime, pero **aquello estaba mal porque era la identidad
del trabajo** — por eso cambiar la cantidad de aplicaciones lo partía en dos.
Acá es una inferencia por única vez, porque la planilla no trae ningún id, y el
resultado se persiste como una fila que ya no depende del agrupamiento.

Deshacer una importación de visitas ahora borra también los trabajos que
infirió; si no quedaban pidiendo aplicaciones de un tratamiento sin visitas.

Verificado contra la base: 7 filas → 3 trabajos + 1 visita suelta, y Pendientes
pasó a pedir "aplicación 3 de 3 — Ana Fernández · Termitas".

### Importar movimientos de caja

Tercera entidad del importador. Cierra Finanzas con datos históricos, que hasta
ahora arrancaba vacía aunque se importaran años de visitas cobradas — las visitas
importadas deliberadamente no generan transacciones.

**El cliente es opcional acá, al revés que en visitas.** Un gasto de nafta no
tiene cliente: las filas que no lo resuelven entran igual, sin enganche. Los
nombres que sí venían y no se encontraron se listan aparte; una celda vacía no
se reporta, porque no es un nombre que falló sino una fila que no declara
cliente. Lo define `clientRequired` en la config de cada entidad, así que
`resolveClientRefs` sirvió tal cual — solo hubo que devolver la fila entera en
`unmatched` en vez de solo el nombre.

**Tampoco se enganchan a una visita.** Adivinar cuál pagó cada movimiento por
fecha y monto daría falsos positivos, y una transacción atada a la visita
equivocada ensucia el historial del cliente sin que se note.

#### Un bug de fechas que no se ve en UTC-3

`transactionDate` es `DATE` en Postgres. Ya teníamos documentado que al **leer**
Prisma devuelve medianoche UTC y en UTC-3 se mostraba el día anterior. Al
**escribir** pasa lo simétrico y es peor, porque no se manifiesta acá:
`parseImportDate` devuelve medianoche *local*, y Prisma guarda la parte UTC. En
un servidor con offset positivo el 15/01 se guardaría como 14/01.

Por eso el importador pasa todo por `toDateOnly` antes de escribir en una
columna `DATE`. Hay tests que lo fijan, y quedó anotado en estado.md para
cualquier código nuevo que escriba ahí.

Verificado contra la base: 8 filas → 7 movimientos (1 duplicado omitido), fechas
exactas leídas por partes UTC, "8.400,50" como 8400.5, y la fila con cliente
inexistente importada igual sin enganche.

## Next Steps
- [ ] Use `labelRecurringAgreement` / `labelMultiVisitJob` in the remaining
      screens — the hook exists and Pendientes, the visit form and the jobs
      section read it, but other screens still say "Abono" and "Tratamiento"
- [ ] `getPendingVisits` loads every visit of the tenant (a semi-annual service
      due today was last done six months ago, so the window cannot be small).
      Fine at demo scale; revisit alongside archiving.
- [ ] Notes, Team and History pages (routers are ready)
- [ ] Routers still stubbed: `ai`, `import`, superadmin
- [ ] Header: real breadcrumbs, working search, notifications from `notes.dueReminders`
- [ ] Client portal, onboarding wizard, import wizard (Fases 5)
- [ ] No tests yet — the plan's Verification Plan expects Vitest + Playwright
- [ ] `checkPermission` runs on the client via `usePermissions`; keep it pure so it
      never pulls a server-only import into the bundle
