# Estado del proyecto — 2 de agosto de 2026

Punto de partida para retomar el trabajo sin releer conversaciones anteriores.
Leer también `CLAUDE.md` (reglas de trabajo) y `docs/implementation_plan.md`
(el plan maestro original).

> El plan maestro está desactualizado en varios puntos porque el negocio nos
> corrigió sobre la marcha. Donde este documento y el plan difieran, **manda este**.

---

## Qué es esto

Portar una app de fumigación hecha en Google Apps Script (`legacy/`) a un SaaS
multi-tenant vendible a **cualquier rubro que trabaje igual**: visitas recurrentes
a domicilio, más trabajos que llevan varias visitas.

No es replicar lo viejo ni empezar de cero. Lo viejo se probó con una fumigadora
real y funcionó — hay que conservar las ideas buenas y tirar los alambres.

---

## Cómo correrlo

PostgreSQL en el **puerto 5433** (Homebrew `postgresql@17`); el 5432 lo ocupa una
instalación de PostgreSQL 14 previa del sistema.

```bash
npm run dev          # http://localhost:3000
npm test             # 163 tests
npx tsc --noEmit
npx prisma db push
npx prisma db seed   # idempotente
```

Login: `owner@lozanor.com` / `demo1234` · Operador: `operador@lozanor.com` / `oper1234`

---

## Decisiones de negocio ya tomadas (no volver a preguntar)

**La app nunca agenda sola.** Calcula, avisa y sugiere fechas; el turno lo pone
siempre el usuario. Esto también limita al recomendador IA: propone, no reserva.

**Pendientes = lo que falta *agendar***, no lo que falta hacer:

| Acción sobre una visita | Efecto en Pendientes |
|---|---|
| Se le pone fecha | sale, sea cual sea el estado |
| Se completa | sale |
| Se cancela | sale definitivo, queda como cancelada |
| **Se elimina del calendario** | **vuelve** — es la única forma de que reaparezca |

**Un cliente puede tener abono y visita puntual a la vez.** La puntual no salda el
abono (configurable por rubro). El abono puede ser de varias aplicaciones.

**Vencimiento por período de calendario** ("el abono de agosto"), no por días
transcurridos. Un fumigador que hace dos aplicaciones se organiza para que las dos
entren en el mes con 15 días de separación.

**"Saldar"** cierra un período sin agendar nada: registra una visita `SKIPPED`.
Eso avanza el vencimiento al período siguiente. Eliminar esa fila lo devuelve.

**Los 15 días entre aplicaciones son un aviso, no un bloqueo.** En la app vieja ni
siquiera eran un dato: eran una frase dentro del prompt de la IA
(`legacy/code.gs:1816`).

**Importar nunca descarta una fila por un campo opcional.** Un email mal escrito
no puede hacer perder un cliente: entra sin email y queda el aviso. Lo único que
tira una fila es que falte un campo obligatorio. La planilla es de otro y
siempre tiene alguna celda sucia; adaptarse es tarea nuestra.

---

## Qué está hecho

**Fundación** — Next.js 15 + tRPC + Prisma + Auth.js. Login real, middleware de
protección, RBAC con matriz granular por módulo (`server/lib/permissions.ts`) y
`permissionProcedure(module, action)` aplicado en todos los routers.

**Routers** — auth, dashboard, clients, visits, jobs, requests, transactions,
notes, users, tenant, history, import. Stub todavía: `ai`, superadmin.

**Trabajo (`Job`) es una entidad.** Una fila por trabajo multi-visita; las
visitas le pertenecen vía `Visit.jobId`. El trabajo manda sobre cuántas
aplicaciones son, así que **cambiar la cantidad a mitad de camino funciona** —
con el agrupamiento viejo eso partía el trabajo en dos. Se pueden abrir desde el
formulario de visita, desde una solicitud, o solos (un trabajo sin ninguna
visita ya pide su aplicación 1). `Job.closedAt` reemplaza a `followUpClosed` y
tiene botón de cerrar/reabrir en Pendientes y en la ficha del cliente. La
cantidad se sigue cargando a mano.

**Páginas** — Panel, Agenda (FullCalendar con drag & drop), Clientes + detalle,
Solicitudes, Pendientes, Finanzas, Notas, Equipo, Historial, Importar, Ajustes,
Onboarding. **El nav no linkea a nada que no exista**: el Asesor IA sale recién
cuando tenga página.

**Importador** — el wizard de la Fase 5, funcionando para **las seis entidades
del legacy**: clientes, visitas, movimientos, solicitudes, notas y equipo. Subir
CSV → mapeo automático → preview con avisos → importar → deshacer.

**Importar el equipo crea fichas, no accesos.** Cada persona entra desactivada y
con el hash de una contraseña aleatoria que no se guarda ni se muestra: nadie
puede iniciar sesión hasta que el dueño la habilite desde Equipo. Una planilla de
empleados es exactamente el archivo que más circula por WhatsApp, así que crear
credenciales usables a partir de ella sería repartir accesos al sistema sin que
ninguna persona lo decida. Un email repetido **nunca** pisa al usuario que ya
existe, sea cual sea la estrategia de duplicados: el que está en la base puede
tener permisos afinados a mano y una contraseña en uso.

> Ahí apareció un bug que encontró un test: el motor trataba un email inválido
> como aviso ("entra sin email"), pero en Equipo el email *es* la identidad. La
> fila entraba sin él y después el executor la salteaba en silencio — una persona
> perdida sin que figure en ningún contador. Ahora un campo `required` que no
> parsea es error, no aviso, en email y teléfono igual que ya pasaba con fecha e
> importe.

Solicitudes y notas siguen las reglas de siempre: la solicitud se engancha al
cliente por id de origen o nombre y se rechaza si no aparece; la nota no cuelga
de nadie, así que se puede importar primero. Deshacer una importación de
solicitudes **no** se lleva puestos los turnos que ya hubieran salido de ellas:
la visita queda con `requestId` en null, no se borra.

Importar el historial de visitas no es un extra: sin él, un negocio que importa
200 clientes con abono abre Pendientes y ve 200 items venciendo hoy, porque no
hay visita previa con la cual calcular el próximo vencimiento. Verificado — al
importar historial, `recurring` pasa de 1 a 0 en la demo.

Las visitas se enganchan al cliente por **id de origen si lo hay, y si no por
nombre exacto normalizado — nunca adivinando**. Una visita colgada del cliente
equivocado no rompe nada visible pero corrompe Pendientes en silencio: le salda
el período a quien no corresponde. Se rechaza la fila y se muestra qué
referencia no apareció.

Las visitas importadas **no** generan transacciones ni pasan por
`onVisitStatusChange`: son historial, no trabajo recién completado. Si no,
importar dos años de visitas cobradas inventaría dos años de ingresos hoy.

**Las filas que declaran "N de M" se agrupan en `Job` de verdad.** Sin eso
entraban como visitas sueltas y Pendientes nunca pedía la aplicación faltante:
un tratamiento en curso se perdía sin que se note. `groupIntoJobs` corta cuando
la secuencia vuelve a empezar o cuando el trabajo se completó, así que dos
tratamientos iguales del mismo cliente en fechas distintas no se fusionan.

> Ese agrupamiento usa la misma clave que sacamos del runtime
> (cliente + servicio + total). No es una recaída: aquello estaba mal porque era
> la **identidad** del trabajo, y por eso cambiar la cantidad lo partía en dos.
> Acá es una **inferencia por única vez** — la planilla no trae ningún id — y el
> resultado se persiste como una fila que ya no depende del agrupamiento.

**Migrar desde la app vieja funciona.** Probado con las columnas reales de sus
hojas `Clients` y `Visits`: se importan clientes primero, y las visitas se
enganchan por el **id de origen** (`Client.externalId`), que es como la planilla
vieja las referencia. El id se prueba antes que el nombre porque es exacto y no
depende de cómo esté escrito. La columna `time`, que el legacy guarda aparte, se
combina con la fecha.

> El simulacro completo está en el commit correspondiente. Detalle que vale:
> una visita `OMITIDA_MES` migrada entra como `SKIPPED`, así que **no** figura
> como "última visita" — la regla de "período saldado sin visitar" sobrevive la
> migración.

**En movimientos el cliente es opcional.** Un gasto de nafta no tiene cliente:
las filas que no lo resuelven entran igual, sin enganche, y los nombres que no
se encontraron se listan para poder corregirlos. Es al revés que en visitas,
donde una fila sin cliente no significa nada. Lo define `clientRequired` en la
config de cada entidad.

Los movimientos importados **no se enganchan a una visita**. Adivinar cuál pagó
cada uno por fecha y monto daría falsos positivos, y una transacción atada a la
visita equivocada ensucia el historial del cliente sin que se note.

**Historial** lee `audit_logs`, que hasta ahora se escribían y no los leía nadie.
Append-only: no hay create/update/delete. El filtro solo ofrece las acciones que
algo escribe de verdad (`CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `IMPORT`)
— un filtro que nunca puede dar resultados se lee como un bug.

**Equipo** audita lo sensible: alta de usuario, cambio de rol, cambio de
permisos, reset de contraseña y desactivación. Nunca se registra la contraseña
ni su hash, solo que el reset ocurrió. Un cambio de nombre no genera entrada.

**Multi-rubro** — 8 presets en `server/lib/industries.ts` (fumigación, piletas,
tanques, jardinería, climatización, matafuegos, limpieza, custom). Cada uno define
cadencia, anclaje, mínimo entre aplicaciones, servicios, horarios y las tres
etiquetas. Wizard de onboarding + página de Ajustes para cambiarlo todo después.

**Configurable por negocio, con override por cliente:** cadencia
(unidad + intervalo), anclaje (calendario / última visita), si la puntual salda el
período, días mínimos entre aplicaciones, y las tres etiquetas.

**Deliberadamente NO configurable:** "solo la próxima aplicación" (el código viejo
dice que evita visitas fantasma — es aprendizaje, no preferencia), "nunca agendar
solo", y "cancelada salda / eliminada vuelve".

---

## Dónde vive cada cosa

| Archivo | Qué es |
|---|---|
| `server/services/pending.ts` | **Toda** la lógica de Pendientes. Función pura sin Prisma, 42 tests. Cualquier regla nueva va acá. |
| `server/services/pending.test.ts` | Los 42 tests. Agregar una variante = una rama + un test por lado. |
| `server/trpc/routers/jobs.ts` | Trabajos multi-visita: abrir, cambiar la cantidad, cerrar, reabrir. |
| `server/trpc/routers/history.ts` | Lee `audit_logs`. Append-only a propósito: sin create/update/delete. |
| `server/services/import.ts` | Motor del importador: parsear, mapear, validar, resolver clientes, agrupar trabajos. Puro, sin Prisma, 121 tests. |
| `server/lib/import/signatures.ts` | Único archivo que conoce los campos importables y sus alias. Sumar un campo = una entrada más. |
| `server/services/import.service.ts` | Escribe lo que el motor preparó. Una sola transacción, con `importId` para poder deshacer. |
| `server/services/audit.service.ts` | `recordAudit` nunca rompe la operación que registra: loguea y traga el error. |
| `prisma/backfill-jobs.ts` | Cómo se migraron los datos viejos al modelo `Job`. SQL crudo, idempotente, no-op si ya corrió. |
| `server/lib/industries.ts` | Único archivo que conoce los rubros. Sumar uno = una entrada más. |
| `server/lib/permissions.ts` | Matriz de permisos. `checkPermission` corre también en el cliente vía `usePermissions()`. |
| `server/services/visit.service.ts` | Carga datos para `buildPendingItems` + sync de finanzas + aviso de intervalo. |
| `hooks/useTenantLabels.ts` | Las tres etiquetas del rubro. Usar esto, nunca texto hardcodeado. |

---

## Qué sigue, por prioridad

1. **Lo que le falta al importador.** Las seis entidades del legacy ya entran
   (`Clients`, `Visits`, `Transactions`, `Requests`, `Notes`, `Users`).
   - Las visitas archivadas viven en hojas aparte (`Visits_2024`, etc.): se
     pueden importar de a una, pero es manual.
   - **Excel (.xlsx) y Google Sheets** no están. CSV cubre el caso porque
     exportar es un clic en los dos, pero xlsx directo requiere elegir una
     librería — `xlsx`/SheetJS tiene avisos de seguridad conocidos, así que la
     decisión quedó pendiente en vez de tomarla de prepo.
   - **Sin límites por plan.** El plan maestro pide Free = 50 filas y 1
     importación. No está: la tabla `Plan` existe pero no hay nada que lea la
     cuota. Va junto con la facturación.
   - **No hay creación de clientes al vuelo** al importar visitas: si el cliente
     no existe, la fila queda afuera. Es deliberado, pero un toggle "crear los
     que falten" ahorraría un paso en una migración grande.

2. **Asesor IA.** Router `ai` stub, sin página. Es lo que hacía el prompt de la
   app vieja (`legacy/code.gs:1816`). `TenantSettings` ya guarda `aiProvider` y
   la key encriptada. **Propone, no reserva** — la regla de no agendar solo lo
   limita.

3. **Las etiquetas por tenant no llegaron a toda la UI.** `useTenantLabels()`
   existe y lo usan Pendientes, el formulario de visita y la sección de trabajos,
   pero quedan pantallas diciendo "Abono" y "Tratamiento" hardcodeado.

4. **`getPendingVisits` carga todas las visitas del tenant** (y ahora también
   todos los trabajos). Un servicio semestral que vence hoy se hizo hace seis
   meses, así que la ventana no puede ser chica. Está bien a escala demo;
   revisar junto con el archivado.

5. **Tests:** `pending.ts` (42) e `import.ts` (121) están cubiertos. Los routers
   no tienen tests de integración — la transacción que abre trabajo + primera
   visita, el chequeo de que el trabajo sea del mismo cliente, y el deshacer de
   una importación están probados a mano contra la base pero no automatizados.
   El plan pide además Playwright.

6. **La agenda no muestra a qué trabajo pertenece una visita.** La ficha del
   cliente sí (columna Servicio, "2/3"), el calendario no.

7. **Acciones de auditoría sin escritor:** `LOGIN`, `SCHEDULE` y `ARCHIVE`
   existen en `AuditAction` pero nadie las escribe. Están fuera del filtro de
   Historial hasta que existan. `LOGIN` en particular requiere decidir volumen y
   privacidad antes de meterlo en `auth.ts`.

9. **Nada de la parte "vendible" está construido.** Es la otra mitad de la Fase 5
   del plan y no estaba en esta lista:
   - **Superadmin:** no hay forma de administrar tenants desde afuera. El
     `Tenant` "ServiFlow Platform" existe en el seed pero no tiene pantallas.
   - **Facturación:** `Plan` y `Subscription` están en el schema, sin nada que
     los lea ni cobre. De acá salen también los límites por plan del punto 1.
   - **Portal del cliente:** el rol `CLIENT` existe en la matriz de permisos y
     `User.clientId` también, pero no hay ninguna pantalla para ese rol.

8. **El header sigue sin usar `notes.dueReminders`.** La página de Notas ya marca
   los vencidos y permite archivarlos; falta la campanita.

---

## Bugs encontrados y corregidos (para no repetirlos)

- `Transaction.transactionDate` es `DATE` en Postgres: Prisma lo devuelve a
  medianoche UTC y en UTC-3 se mostraba **el día anterior**. Ver `formatDateOnly`
  y `toDateOnlyInputValue` en `lib/format.ts`.
- El mismo problema existe **al escribir**, y es más traicionero porque no se ve
  en UTC-3. `parseImportDate` devuelve medianoche *local* y Prisma guarda la
  parte UTC: en un servidor con offset positivo el 15/01 se guardaría 14/01. Por
  eso el importador pasa todo por `toDateOnly` antes de escribir en una columna
  `DATE`. Cualquier código nuevo que escriba ahí tiene que hacer lo mismo.
- El motor de permisos leía `permissions` como array de strings cuando el schema
  guarda un objeto: **ADMIN nunca podía pasar ningún chequeo**.
- `addCadence` con meses: 31 de enero + 1 mes tiene que caer el 28 de febrero, no
  saltar a marzo.
- Un contrato sin ninguna visita histórica no es "3 meses de atraso": no hay
  evidencia de que existiera antes. Lo detectó un test.
- Un período saldado sin visitar cerraba bien el compromiso pero se mostraba como
  "última visita".
- `npm run build` pisa el `.next` del dev server y lo deja sirviendo 404s. Después
  de compilar: matar el server, `rm -rf .next`, y volver a levantarlo.
- El agrupamiento viejo de trabajos metía la cantidad de aplicaciones *dentro* de
  la clave, así que cambiarla partía el trabajo en dos y el fantasma seguía
  pidiendo su propia próxima aplicación. Por eso `Job` es una fila: la cantidad
  es un atributo del trabajo, no parte de su identidad.
