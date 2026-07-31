# Lozanor → ServiFlow: Plan de Arquitectura SaaS Multi-Tenant

Transformar la app de gestión de fumigación "Lozanor" (Google Apps Script) en una plataforma SaaS multi-tenant moderna para cualquier negocio de servicios a domicilio (fumigación, jardinería, limpieza de piletas/tanques, mantenimiento, etc.).

---

## User Review Required

> [!IMPORTANT]
> **Nombre de la plataforma**: Usamos "ServiFlow" como nombre de trabajo. ¿Tenés otro nombre en mente?

> [!IMPORTANT]
> **Modelo de monetización**: El plan propone un modelo freemium con 3 tiers (Free / Pro / Business). ¿Preferís otro esquema (precio fijo, por uso, etc.)?

> [!WARNING]
> **Migración de datos existentes**: El plan incluye un **Sistema de Importación de Datos** completo — no solo un script de migración para Lozanor, sino una funcionalidad self-service que permite a cualquier nuevo negocio subir su base de datos existente (CSV, Excel, Google Sheets). Esto es un feature diferenciador de la plataforma.

> [!IMPORTANT]
> **Dominio y despliegue**: El plan asume `serviflow.app` o similar. ¿Ya tenés un dominio comprado o querés que lo definamos después?

---

## Open Questions

1. **¿Querés mantener la integración con Google Calendar como feature opcional por tenant, o reemplazarla con un calendario propio integrado?**
2. **¿El portal de clientes (donde los clientes ven sus visitas y hacen solicitudes) debe ser una app separada o una sección dentro de la misma app?**
3. **¿Querés soporte para múltiples idiomas desde el arranque, o empezamos solo en español?**
4. **¿Los operativos/técnicos necesitan una app móvil nativa (PWA) o alcanza con la versión web responsive?**
5. **¿Cada negocio debería poder personalizar colores/logo de su portal, o todos usan el mismo branding de la plataforma?**

---

## Análisis de la App Actual (Resumen Ejecutivo)

### Lo que funciona bien (conservar las ideas)
- ✅ Sistema de roles granular (ADMIN → ADMIN2 → OPERATIVO → CLIENT)
- ✅ Agenda con estados de visita bien definidos (POR_CONFIRMAR → CONFIRMADA → REALIZADA)
- ✅ Sistema de "Pendientes" que detecta automáticamente visitas faltantes del mes
- ✅ Tratamientos multi-aplicación con tracking de secuencia
- ✅ Recomendador IA con cálculo de distancias Haversine
- ✅ Sincronización automática de finanzas con visitas
- ✅ Notas con alarmas programadas por email
- ✅ Portal de auto-registro para clientes
- ✅ Soft-delete en todas las entidades
- ✅ Datos estructurados en tablas claras (Clients, Visits, Transactions, etc.) — facilita migración

### Lo que necesita rediseño (problemas de la arquitectura actual)
- ❌ Google Sheets como base de datos (no escala, no tiene índices, no soporta queries complejas)
- ❌ Autenticación con PIN (inseguro para producción SaaS)
- ❌ Todo el frontend en un solo archivo HTML de ~500KB
- ❌ Sin multi-tenancy (hardcoded para un solo negocio)
- ❌ Caching acoplado a `CacheService` de Google
- ❌ Sin tests, sin CI/CD, sin versionado de API
- ❌ Configuración hardcodeada (dirección base, API keys, email admin)

---

## Tech Stack Propuesto

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Framework Full-Stack** | **Next.js 15** (App Router) | SSR/SSG, API routes, middleware auth, deploy fácil en Railway/Vercel |
| **Lenguaje** | **TypeScript** | Type safety end-to-end, autocompletado, menos bugs |
| **Base de datos** | **PostgreSQL 16** (Railway) | Relacional, robusto, soporte JSON, full-text search, extensiones geo |
| **ORM** | **Prisma** | Type-safe queries, migraciones automáticas, introspección de schema |
| **Autenticación** | **Auth.js v5** (NextAuth) | Email + password, OAuth providers, JWT sessions, multi-tenant ready |
| **Styling** | **Tailwind CSS v4** | Ya usado en la app actual, utility-first, dark mode, responsive |
| **UI Components** | **shadcn/ui** | Componentes accesibles, customizables, basados en Radix UI |
| **State Management** | **TanStack Query (React Query)** | Cache inteligente, refetch automático, optimistic updates |
| **Email** | **Resend** | API moderna, templates React, transaccional + marketing |
| **AI** | **Vercel AI SDK** | Streaming, multi-provider (OpenAI, Groq, Google AI), chat UI |
| **Mapas/Geo** | **Leaflet + OpenStreetMap** | Free, sin API key, clustering, routing |
| **Calendario** | **Propio (FullCalendar)** | Sin depender de Google Calendar, drag & drop |
| **Pagos** | **MercadoPago / Stripe** | Suscripciones recurrentes, checkout integrado |
| **Deploy** | **Railway** (DB + Backend) | PostgreSQL managed, auto-deploy desde GitHub |
| **CDN/Frontend** | **Vercel** o **Railway** | Edge network, preview deploys, analytics |
| **Monitoreo** | **Sentry** | Error tracking, performance monitoring |
| **CI/CD** | **GitHub Actions** | Tests, lint, deploy automático |

---

## Arquitectura Multi-Tenant

### Estrategia: Single Database, Shared Schema con `tenantId`

```mermaid
graph TB
    subgraph "Capa de Presentación"
        A[Landing Page / Marketing] --> B[Login / Registro]
        B --> C{Tipo de Usuario}
        C -->|Super Admin| D[Panel Super Admin]
        C -->|Dueño de Negocio| E[Dashboard del Negocio]
        C -->|Operativo| F[Vista Operativo]
        C -->|Cliente Final| G[Portal Cliente]
    end

    subgraph "Capa de API - Next.js API Routes"
        H[Auth Middleware + Tenant Resolver]
        I[REST API / tRPC]
        J[Cron Jobs - Inngest]
    end

    subgraph "Capa de Datos"
        K[(PostgreSQL en Railway)]
        L[Redis Cache - Upstash]
        M[File Storage - S3]
    end

    E & F & G --> H --> I --> K
    J --> K
    I --> L
```

### Aislamiento de Datos

Todas las tablas de negocio incluyen `tenantId` como columna obligatoria. Un middleware en cada request:

1. Extrae el `tenantId` del JWT del usuario autenticado
2. Inyecta automáticamente el filtro `WHERE tenantId = ?` en todas las queries via Prisma middleware
3. Previene acceso cruzado entre tenants a nivel de ORM

```
┌─────────────────────────────────────────┐
│           SUPER ADMIN LAYER             │
│  (Gestión global de tenants, planes,    │
│   métricas, facturación)                │
├─────────────────────────────────────────┤
│  Tenant A          │  Tenant B          │
│  "Lozanor Fumig."  │  "Verde Jardín"    │
│  ┌──────────┐      │  ┌──────────┐      │
│  │ Users    │      │  │ Users    │      │
│  │ Clients  │      │  │ Clients  │      │
│  │ Visits   │      │  │ Visits   │      │
│  │ Requests │      │  │ Requests │      │
│  │ Finance  │      │  │ Finance  │      │
│  │ Notes    │      │  │ Notes    │      │
│  │ Settings │      │  │ Settings │      │
│  └──────────┘      │  └──────────┘      │
├─────────────────────┴───────────────────┤
│         PostgreSQL (Railway)            │
└─────────────────────────────────────────┘
```

---

## Esquema de Base de Datos (PostgreSQL + Prisma)

### Entidades del Sistema (sin `tenantId`)

```mermaid
erDiagram
    Tenant ||--o{ User : "has many"
    Tenant ||--o{ TenantSettings : "has one"
    Tenant ||--o{ Subscription : "has many"
    Plan ||--o{ Subscription : "subscribed by"

    Tenant {
        uuid id PK
        string name
        string slug UK
        string industry
        string logo_url
        string timezone
        string country
        string currency
        enum status
        timestamp created_at
        timestamp updated_at
    }

    Plan {
        uuid id PK
        string name
        string stripe_price_id
        int max_users
        int max_clients
        boolean ai_enabled
        boolean calendar_sync
        boolean custom_branding
        decimal monthly_price
        decimal annual_price
    }

    Subscription {
        uuid id PK
        uuid tenant_id FK
        uuid plan_id FK
        enum status
        timestamp current_period_start
        timestamp current_period_end
        string payment_provider_id
    }
```

### Entidades del Negocio (con `tenantId`)

```mermaid
erDiagram
    User ||--o{ Visit : "assigned to"
    User }o--|| Tenant : "belongs to"
    Client ||--o{ Visit : "receives"
    Client ||--o{ ServiceRequest : "creates"
    Client }o--|| Tenant : "belongs to"
    Visit ||--o{ Transaction : "generates"
    Visit }o--|| Tenant : "belongs to"

    User {
        uuid id PK
        uuid tenant_id FK
        string email UK
        string name
        string password_hash
        enum role
        uuid client_id FK
        jsonb permissions
        boolean is_active
        int session_version
        timestamp created_at
    }

    Client {
        uuid id PK
        uuid tenant_id FK
        string name
        string email
        string phone
        string address
        decimal lat
        decimal lng
        enum relationship_type
        enum status
        string[] pest_types
        string[] preferred_days
        string[] preferred_slots
        text notes
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    Visit {
        uuid id PK
        uuid tenant_id FK
        uuid client_id FK
        uuid assigned_user_id FK
        uuid request_id FK
        timestamp scheduled_at
        int duration_minutes
        string service_type
        enum status
        enum payment_status
        decimal price
        boolean price_waived
        string[] pest_types
        int application_number
        int total_applications
        text notes
        string calendar_event_id
        timestamp completed_at
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    ServiceRequest {
        uuid id PK
        uuid tenant_id FK
        uuid client_id FK
        string client_name
        string[] pest_types
        enum urgency
        enum status
        text comment
        timestamp created_at
        timestamp updated_at
    }

    Transaction {
        uuid id PK
        uuid tenant_id FK
        uuid visit_id FK
        uuid client_id FK
        enum type
        decimal amount
        string category
        date transaction_date
        text notes
        timestamp created_at
        timestamp deleted_at
    }

    Note {
        uuid id PK
        uuid tenant_id FK
        uuid created_by FK
        text content
        timestamp reminder_at
        timestamp reminder_sent_at
        timestamp created_at
        timestamp deleted_at
    }

    TenantSettings {
        uuid id PK
        uuid tenant_id FK
        string base_address
        decimal base_lat
        decimal base_lng
        string ai_provider
        string ai_api_key_encrypted
        string google_calendar_id
        string calendar_event_title_prefix
        int calendar_event_duration
        int visit_archive_years
        string admin_email
        string working_hours_start
        string working_hours_end
        int visit_interval_days
        jsonb custom_service_types
        jsonb custom_visit_statuses
    }
```

### Tablas Completas (SQL/Prisma)

#### `tenants` - Organizaciones/Negocios
```
id                  UUID PK DEFAULT gen_random_uuid()
name                VARCHAR(255) NOT NULL
slug                VARCHAR(100) UNIQUE NOT NULL  -- URL-friendly identifier
industry            VARCHAR(100)  -- 'fumigacion', 'jardineria', 'limpieza_piletas', etc.
logo_url            TEXT
timezone            VARCHAR(50) DEFAULT 'America/Argentina/Buenos_Aires'
country             VARCHAR(2) DEFAULT 'AR'
currency            VARCHAR(3) DEFAULT 'ARS'
status              ENUM('ACTIVE','SUSPENDED','CANCELLED') DEFAULT 'ACTIVE'
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

#### `plans` - Planes de suscripción
```
id                  UUID PK
name                VARCHAR(50) NOT NULL  -- 'free', 'pro', 'business'
max_users           INT DEFAULT 2
max_clients         INT DEFAULT 50
max_visits_month    INT DEFAULT 100
ai_enabled          BOOLEAN DEFAULT false
calendar_sync       BOOLEAN DEFAULT false
custom_branding     BOOLEAN DEFAULT false
api_access          BOOLEAN DEFAULT false
monthly_price_ars   DECIMAL(10,2)
annual_price_ars    DECIMAL(10,2)
```

#### `users` - Usuarios de todos los tenants
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
email               VARCHAR(255) NOT NULL
name                VARCHAR(255) NOT NULL
password_hash       VARCHAR(255) NOT NULL  -- bcrypt hash
role                ENUM('OWNER','ADMIN','OPERATOR','CLIENT') NOT NULL
client_id           UUID FK -> clients.id  -- solo si role='CLIENT'
permissions         JSONB DEFAULT '{}'  -- permisos granulares tipo ADMIN2
avatar_url          TEXT
is_active           BOOLEAN DEFAULT true
session_version     INT DEFAULT 1
last_login_at       TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
UNIQUE(tenant_id, email)
```

#### `clients` - Clientes de cada negocio
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
name                VARCHAR(255) NOT NULL
email               VARCHAR(255)
phone               VARCHAR(50)
address             TEXT
lat                 DECIMAL(10,7)
lng                 DECIMAL(10,7)
relationship_type   ENUM('CONTRACT','ON_DEMAND') DEFAULT 'ON_DEMAND'
status              ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE'
service_types       TEXT[]  -- tipos de servicio que necesita
preferred_days      TEXT[]
preferred_slots     TEXT[]
notes               TEXT
metadata            JSONB DEFAULT '{}'  -- campos custom por industria
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
deleted_at          TIMESTAMPTZ  -- soft delete
INDEX(tenant_id, status)
INDEX(tenant_id, relationship_type)
```

#### `visits` - Visitas/Trabajos programados
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
client_id           UUID FK -> clients.id NOT NULL
assigned_user_id    UUID FK -> users.id
request_id          UUID FK -> service_requests.id
scheduled_at        TIMESTAMPTZ NOT NULL
duration_minutes    INT DEFAULT 45
service_type        VARCHAR(100)  -- configurable por tenant
status              ENUM('PENDING_CONFIRM','CONFIRMED','COMPLETED','CANCELLED','SKIPPED') DEFAULT 'PENDING_CONFIRM'
payment_status      ENUM('PENDING','PAID','WAIVED') DEFAULT 'PENDING'
price               DECIMAL(10,2) DEFAULT 0
price_waived        BOOLEAN DEFAULT false
service_details     TEXT[]  -- pest types, service specifics
application_number  INT  -- para tratamientos multi-aplicación
total_applications  INT
notes               TEXT
calendar_event_id   VARCHAR(255)  -- Google Calendar event ID
completed_at        TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
deleted_at          TIMESTAMPTZ
INDEX(tenant_id, status, scheduled_at)
INDEX(tenant_id, client_id)
INDEX(tenant_id, assigned_user_id)
INDEX(tenant_id, scheduled_at)
```

#### `service_requests` - Solicitudes de servicio
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
client_id           UUID FK -> clients.id NOT NULL
client_name         VARCHAR(255)
service_types       TEXT[]
urgency             ENUM('LOW','MEDIUM','HIGH') DEFAULT 'MEDIUM'
status              ENUM('PENDING','SCHEDULED','CLOSED') DEFAULT 'PENDING'
comment             TEXT
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

#### `transactions` - Movimientos financieros
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
visit_id            UUID FK -> visits.id
client_id           UUID FK -> clients.id
type                ENUM('INCOME','EXPENSE') NOT NULL
amount              DECIMAL(10,2) NOT NULL
category            VARCHAR(100)
transaction_date    DATE NOT NULL
notes               TEXT
created_at          TIMESTAMPTZ DEFAULT NOW()
deleted_at          TIMESTAMPTZ
INDEX(tenant_id, transaction_date)
INDEX(tenant_id, type)
```

#### `notes` - Notas y alarmas
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
created_by          UUID FK -> users.id NOT NULL
content             TEXT NOT NULL
reminder_at         TIMESTAMPTZ
reminder_sent_at    TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT NOW()
deleted_at          TIMESTAMPTZ
INDEX(tenant_id, reminder_at)
```

#### `audit_logs` - Log de auditoría (NUEVO)
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
user_id             UUID FK -> users.id
action              VARCHAR(50)  -- 'CREATE','UPDATE','DELETE','ARCHIVE','LOGIN'
entity_type         VARCHAR(50)  -- 'visit','client','transaction'
entity_id           UUID
changes             JSONB  -- { field: { old: x, new: y } }
ip_address          INET
created_at          TIMESTAMPTZ DEFAULT NOW()
INDEX(tenant_id, created_at)
INDEX(tenant_id, entity_type, entity_id)
```

---

## Estructura del Proyecto

```
serviflow/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint + Tests + Type check
│       └── deploy.yml                # Deploy a Railway/Vercel
│
├── prisma/
│   ├── schema.prisma                 # Schema completo
│   ├── migrations/                   # Migraciones auto-generadas
│   └── seed.ts                       # Datos iniciales (planes, super admin)
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # Landing page, pricing, features
│   │   │   ├── page.tsx              # Home/Landing
│   │   │   ├── pricing/page.tsx
│   │   │   └── features/page.tsx
│   │   │
│   │   ├── (auth)/                   # Auth pages
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx     # Registro de nuevo negocio
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── verify-email/page.tsx
│   │   │
│   │   ├── (dashboard)/              # App principal (requiere auth)
│   │   │   ├── layout.tsx            # Sidebar + Header + Tenant context
│   │   │   ├── page.tsx              # Dashboard con KPIs
│   │   │   ├── agenda/
│   │   │   │   ├── page.tsx          # Vista calendario + lista
│   │   │   │   └── [visitId]/page.tsx
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx          # Lista de clientes
│   │   │   │   └── [clientId]/page.tsx
│   │   │   ├── requests/
│   │   │   │   └── page.tsx          # Solicitudes
│   │   │   ├── pending/
│   │   │   │   └── page.tsx          # Pendientes del mes
│   │   │   ├── finance/
│   │   │   │   └── page.tsx          # Finanzas y movimientos
│   │   │   ├── history/
│   │   │   │   └── page.tsx          # Historial de visitas
│   │   │   ├── notes/
│   │   │   │   └── page.tsx          # Notas y alarmas
│   │   │   ├── ai-advisor/
│   │   │   │   └── page.tsx          # Recomendador IA
│   │   │   ├── team/
│   │   │   │   └── page.tsx          # Gestión de equipo/usuarios
│   │   │   └── settings/
│   │   │       ├── page.tsx          # Config general del negocio
│   │   │       ├── billing/page.tsx  # Plan y facturación
│   │   │       └── integrations/page.tsx  # API keys, Calendar, etc.
│   │   │
│   │   ├── (client-portal)/          # Portal para clientes finales
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Dashboard del cliente
│   │   │   ├── visits/page.tsx       # Mis visitas
│   │   │   └── requests/page.tsx     # Mis solicitudes
│   │   │
│   │   ├── (super-admin)/            # Panel Super Admin
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Overview global
│   │   │   ├── tenants/page.tsx      # Gestión de negocios
│   │   │   ├── plans/page.tsx        # Gestión de planes
│   │   │   ├── billing/page.tsx      # Facturación global
│   │   │   └── analytics/page.tsx    # Métricas de plataforma
│   │   │
│   │   ├── api/                      # API Routes
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── trpc/[trpc]/route.ts  # tRPC endpoint
│   │   │   ├── import/               # 🆕 Import API
│   │   │   │   ├── upload/route.ts   # File upload endpoint
│   │   │   │   ├── preview/route.ts  # Parse & preview data
│   │   │   │   ├── execute/route.ts  # Execute import job
│   │   │   │   └── status/[jobId]/route.ts  # Job progress SSE
│   │   │   ├── webhooks/
│   │   │   │   ├── stripe/route.ts
│   │   │   │   └── mercadopago/route.ts
│   │   │   └── cron/
│   │   │       ├── reminders/route.ts
│   │   │       └── archive/route.ts
│   │   │
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Tailwind + custom styles
│   │
│   ├── server/                       # Server-side logic
│   │   ├── db.ts                     # Prisma client singleton
│   │   ├── auth.ts                   # Auth.js config
│   │   ├── trpc/                     # tRPC router definitions
│   │   │   ├── router.ts            # Root router
│   │   │   ├── context.ts           # tRPC context (session, tenant)
│   │   │   ├── middleware.ts        # Auth + tenant isolation middleware
│   │   │   └── routers/
│   │   │       ├── clients.ts
│   │   │       ├── visits.ts
│   │   │       ├── requests.ts
│   │   │       ├── transactions.ts
│   │   │       ├── notes.ts
│   │   │       ├── users.ts
│   │   │       ├── ai.ts
│   │   │       ├── tenant.ts
│   │   │       └── superadmin.ts
│   │   │
│   │   ├── services/                 # Business logic layer
│   │   │   ├── visit.service.ts      # Visit lifecycle, pendientes logic
│   │   │   ├── client.service.ts
│   │   │   ├── finance.service.ts    # Auto-sync visits↔transactions
│   │   │   ├── calendar.service.ts   # Google Calendar sync
│   │   │   ├── ai.service.ts         # Groq/Gemini route optimization
│   │   │   ├── geo.service.ts        # Haversine, distance matrix
│   │   │   ├── notification.service.ts  # Email reminders
│   │   │   ├── archive.service.ts    # Visit archiving
│   │   │   ├── audit.service.ts      # Audit logging
│   │   │   └── import.service.ts     # 🆕 Data import engine
│   │   │
│   │   └── lib/                      # Shared utilities
│   │       ├── tenant-context.ts     # Tenant resolver middleware
│   │       ├── permissions.ts        # RBAC engine
│   │       ├── date-utils.ts         # Timezone-aware date helpers
│   │       ├── validation.ts         # Zod schemas
│   │       ├── constants.ts
│   │       └── import/               # 🆕 Import utilities
│   │           ├── parsers.ts        # CSV, XLSX, Google Sheets parsers
│   │           ├── mappers.ts        # Column auto-detection & mapping
│   │           ├── validators.ts     # Row-level validation
│   │           └── templates.ts      # Import templates by industry
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # shadcn/ui base components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── MobileNav.tsx
│   │   │   └── BreadcrumbNav.tsx
│   │   ├── dashboard/
│   │   │   ├── KPICard.tsx
│   │   │   ├── RevenueChart.tsx
│   │   │   └── UpcomingVisits.tsx
│   │   ├── agenda/
│   │   │   ├── CalendarView.tsx
│   │   │   ├── VisitCard.tsx
│   │   │   ├── VisitForm.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── clients/
│   │   │   ├── ClientTable.tsx
│   │   │   ├── ClientForm.tsx
│   │   │   └── ClientDetail.tsx
│   │   ├── finance/
│   │   │   ├── TransactionTable.tsx
│   │   │   ├── TransactionForm.tsx
│   │   │   ├── MonthlyChart.tsx
│   │   │   └── PaymentBadge.tsx
│   │   ├── ai/
│   │   │   ├── RecommendationPanel.tsx
│   │   │   └── ChatInterface.tsx
│   │   ├── import/                    # 🆕 Data Import System
│   │   │   ├── ImportWizard.tsx       # Wizard multi-step principal
│   │   │   ├── FileUploader.tsx       # Drag & drop + file picker
│   │   │   ├── SheetSelector.tsx      # Selector de hojas (para Excel/Sheets)
│   │   │   ├── ColumnMapper.tsx       # UI de mapeo columnas → campos DB
│   │   │   ├── DataPreview.tsx        # Preview de datos parseados
│   │   │   ├── ValidationReport.tsx   # Reporte de errores y warnings
│   │   │   ├── ImportProgress.tsx     # Barra de progreso de importación
│   │   │   └── ImportHistory.tsx      # Historial de importaciones pasadas
│   │   └── shared/
│   │       ├── DataTable.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── Toast.tsx
│   │       ├── EmptyState.tsx
│   │       └── LoadingSkeleton.tsx
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── useTenant.ts
│   │   ├── usePermissions.ts
│   │   ├── useDebounce.ts
│   │   └── useAutoRefresh.ts
│   │
│   └── lib/                          # Client-side utilities
│       ├── trpc.ts                   # tRPC client
│       ├── utils.ts
│       └── format.ts                 # Phone, address, currency formatters
│
├── scripts/
│   ├── migrate-lozanor.ts            # Script one-off de migración Lozanor → PostgreSQL
│   └── seed-demo-tenant.ts           # Datos demo para nuevos tenants
│
├── public/
│   └── images/
│
├── .env.example
├── .env.local
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## Sistema de Roles y Permisos (Rediseñado)

### Roles del Sistema

| Rol | Scope | Descripción |
|-----|-------|-------------|
| `SUPER_ADMIN` | Global | Administrador de la plataforma. Gestiona todos los tenants, planes, facturación |
| `OWNER` | Tenant | Dueño del negocio. Acceso total a su tenant. No puede ser eliminado |
| `ADMIN` | Tenant | Administrador con permisos granulares configurables (equivale al ADMIN2 actual) |
| `OPERATOR` | Tenant | Técnico/operativo de campo. Ve agenda, marca visitas, agrega notas |
| `CLIENT` | Tenant | Cliente final. Ve sus visitas, crea solicitudes, ve su historial |

### Matriz de Permisos Granulares (para ADMIN)

```typescript
type Permission = {
  agenda:      { read: boolean; write: boolean };
  clients:     { read: boolean; write: boolean };
  requests:    { read: boolean; write: boolean };
  finance:     { read: boolean; write: boolean };
  team:        { read: boolean; write: boolean };
  notes:       { read: boolean; write: boolean };
  ai:          { read: boolean };
  settings:    { read: boolean; write: boolean };
  archive:     { execute: boolean };
};
```

---

## Autenticación y Seguridad

### Auth Flow (Auth.js v5)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant A as Auth.js
    participant DB as PostgreSQL

    U->>F: Email + Password
    F->>A: POST /api/auth/callback/credentials
    A->>DB: Buscar usuario por email
    DB-->>A: User record
    A->>A: bcrypt.compare(password, hash)
    A->>A: Verificar is_active + session_version
    A->>A: Generar JWT con { userId, tenantId, role, permissions }
    A-->>F: Set-Cookie: session JWT (HttpOnly, Secure, SameSite)
    F-->>U: Redirect a Dashboard
```

### Mejoras sobre el sistema actual

| Aspecto | App Actual | ServiFlow |
|---------|-----------|-----------|
| Contraseña | PIN de 4+ chars con SHA-256 | bcrypt (12 rounds) con salt automático |
| Sesión | Token UUID en CacheService | JWT firmado con HttpOnly cookie |
| Rate limiting | CacheService (10 intentos) | Rate limiter con Redis (Upstash) |
| Reset password | No existe | Email con token temporal (Resend) |
| 2FA | No existe | TOTP opcional (Pro plan) |
| OAuth | No existe | Google, GitHub login opcionales |

---

## Flujos de Negocio Clave (Rediseñados)

### 1. Onboarding de un Nuevo Negocio

```mermaid
flowchart LR
    A[Landing Page] --> B[Registro: Nombre, Email, Contraseña]
    B --> C[Crear Tenant + User OWNER]
    C --> D[Wizard de Setup]
    D --> D1[Nombre del negocio + Industria]
    D1 --> D2[Dirección base + Zona de trabajo]
    D2 --> D3[Tipos de servicio que ofrece]
    D3 --> D4[Invitar equipo - opcional]
    D4 --> E[Dashboard listo para usar]
```

### 2. Ciclo de Vida de una Visita (Visit Lifecycle)

```mermaid
stateDiagram-v2
    [*] --> PENDING_CONFIRM: Crear visita
    PENDING_CONFIRM --> CONFIRMED: Confirmar con cliente
    CONFIRMED --> COMPLETED: Marcar realizada
    CONFIRMED --> CANCELLED: Cancelar
    PENDING_CONFIRM --> CANCELLED: Cancelar
    CONFIRMED --> SKIPPED: Omitir este mes
    COMPLETED --> [*]
    CANCELLED --> [*]
    SKIPPED --> [*]

    COMPLETED --> INCOME_GENERATED: Auto-crear transacción INGRESO
    CANCELLED --> CALENDAR_DELETED: Auto-eliminar evento calendario
```

### 3. Sistema de Pendientes (Reimplementado con SQL)

La lógica de `buildPendientesItems` se reimplementa como queries SQL eficientes:

```sql
-- Clientes con contrato mensual sin visita programada este mes
SELECT c.* FROM clients c
WHERE c.tenant_id = $1
  AND c.relationship_type = 'CONTRACT'
  AND c.status = 'ACTIVE'
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM visits v
    WHERE v.client_id = c.id
      AND v.tenant_id = $1
      AND v.status NOT IN ('CANCELLED')
      AND v.deleted_at IS NULL
      AND DATE_TRUNC('month', v.scheduled_at) = DATE_TRUNC('month', NOW())
  );

-- Tratamientos multi-aplicación incompletos
SELECT v.*, c.name as client_name
FROM visits v
JOIN clients c ON c.id = v.client_id
WHERE v.tenant_id = $1
  AND v.total_applications > 1
  AND v.application_number < v.total_applications
  AND v.status = 'COMPLETED'
  AND v.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM visits v2
    WHERE v2.client_id = v.client_id
      AND v2.tenant_id = $1
      AND v2.application_number = v.application_number + 1
      AND v2.deleted_at IS NULL
  );
```

### 4. Sincronización Finanzas ↔ Visitas

Cuando una visita pasa a `COMPLETED` con `payment_status = 'PAID'`:

```typescript
// visit.service.ts
async function onVisitStatusChange(visit: Visit, newStatus: VisitStatus) {
  if (newStatus === 'COMPLETED' && visit.price > 0 && !visit.price_waived) {
    await financeService.upsertVisitIncome(visit);
  }
  if (newStatus === 'CANCELLED') {
    await financeService.softDeleteVisitIncome(visit.id);
    await calendarService.deleteEvent(visit.calendar_event_id);
  }
}
```

### 5. Recomendador IA (Multi-Provider)

```typescript
// ai.service.ts - usando Vercel AI SDK
import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

async function getRouteRecommendation(tenantId: string, payload: AIPayload) {
  const settings = await getTenantSettings(tenantId);
  const provider = settings.ai_provider === 'groq'
    ? createGroq({ apiKey: settings.ai_api_key })
    : createGoogleGenerativeAI({ apiKey: settings.ai_api_key });

  const distanceMatrix = await geoService.buildDistanceMatrix(
    settings.base_lat, settings.base_lng,
    payload.pendingVisits, payload.scheduledVisits
  );

  const prompt = buildOptimizationPrompt(distanceMatrix, payload, settings);

  const { text } = await generateText({
    model: provider(settings.ai_model || 'llama-3.3-70b-versatile'),
    prompt,
    maxTokens: 4000,
  });

  return text;
}
```

---

## Modelo de Monetización (Freemium)

| Feature | Free | Pro ($15k ARS/mes) | Business ($35k ARS/mes) |
|---------|------|---------------------|--------------------------|
| Usuarios | 2 | 10 | Ilimitados |
| Clientes | 50 | 500 | Ilimitados |
| Visitas/mes | 100 | 1,000 | Ilimitadas |
| Agenda + Calendario | ✅ | ✅ | ✅ |
| Clientes + Solicitudes | ✅ | ✅ | ✅ |
| Finanzas básicas | ✅ | ✅ | ✅ |
| Historial (1 año) | ✅ | ✅ (3 años) | ✅ (ilimitado) |
| Notas y alarmas | ✅ | ✅ | ✅ |
| **Importar datos (CSV/Excel)** | ✅ (1 vez, 50 filas) | ✅ (ilimitado) | ✅ (ilimitado) |
| **Importar Google Sheets** | ❌ | ✅ | ✅ |
| Recomendador IA | ❌ | ✅ (100 consultas/mes) | ✅ (ilimitado) |
| Sync Google Calendar | ❌ | ✅ | ✅ |
| Portal de clientes | ❌ | ✅ | ✅ |
| Branding personalizado | ❌ | ❌ | ✅ |
| API access | ❌ | ❌ | ✅ |
| Soporte | Comunidad | Email | Prioritario |

---

## Plan de Implementación por Fases

### Fase 1: Fundación (Semanas 1-3)
> Setup del proyecto, DB, auth, y estructura base

- [ ] Inicializar proyecto Next.js 15 + TypeScript + Tailwind + shadcn/ui
- [ ] Configurar Prisma + PostgreSQL en Railway
- [ ] Definir schema completo y ejecutar migraciones
- [ ] Implementar Auth.js v5 con credentials provider
- [ ] Crear middleware de tenant isolation
- [ ] Configurar tRPC con routers base
- [ ] Seed de datos iniciales (planes, super admin)
- [ ] CI/CD: GitHub Actions → Railway deploy

### Fase 2: Core del Negocio (Semanas 4-7)
> Las 4 funcionalidades principales

- [ ] **Dashboard**: KPIs, gráficos de revenue, visitas próximas
- [ ] **Agenda**: CRUD de visitas, vista calendario (FullCalendar), vista lista, status lifecycle
- [ ] **Clientes**: CRUD, búsqueda, filtros, geolocalización, detalle con historial
- [ ] **Solicitudes**: CRUD, workflow PENDING → SCHEDULED → CLOSED, conversión a visita

### Fase 3: Funcionalidades Avanzadas (Semanas 8-10)
> Finanzas, historial, notas

- [ ] **Finanzas**: Ledger INGRESO/EGRESO, sync automático con visitas, reportes mensuales, gráficos
- [ ] **Pendientes del mes**: Query SQL para contratos sin visita, aplicaciones faltantes
- [ ] **Historial**: Búsqueda por año, archivado automático
- [ ] **Notas y alarmas**: CRUD de notas, cron job para envío de reminders (Inngest/Railway cron)
- [ ] **Gestión de equipo**: CRUD usuarios, roles, permisos granulares

### Fase 4: IA y Integraciones (Semanas 11-12)
> Recomendador IA, calendario, notificaciones

- [ ] **Recomendador IA**: Vercel AI SDK, Groq + Gemini, distance matrix, chat follow-up
- [ ] **Google Calendar sync**: Integración opcional por tenant
- [ ] **Email notifications**: Resend para reminders, alertas de solicitudes, bienvenida

### Fase 5: Multi-Tenant, Importación y Monetización (Semanas 13-16)
> Portal cliente, super admin, importación de datos, pagos

- [ ] **Portal de clientes**: Dashboard simplificado para clientes finales
- [ ] **Onboarding wizard**: Flujo guiado para nuevos negocios
- [ ] **🆕 Sistema de Importación de Datos**: Wizard completo (ver sección dedicada abajo)
  - [ ] Upload de archivos (CSV, XLSX, Google Sheets URL)
  - [ ] Parser multi-formato con detección automática de columnas
  - [ ] UI de mapeo de columnas con preview en tiempo real
  - [ ] Validación y reporte de errores/warnings por fila
  - [ ] Ejecución con barra de progreso y rollback on error
  - [ ] Historial de importaciones con detalle de resultados
- [ ] **🆕 Migración Lozanor**: Script dedicado usando el sistema de importación para migrar toda la base de Google Sheets de Lozanor como Tenant 0
- [ ] **Super Admin panel**: Gestión de tenants, planes, métricas globales
- [ ] **Pagos**: Integración MercadoPago/Stripe para suscripciones
- [ ] **Settings del tenant**: Configuración de negocio, tipos de servicio, zona de trabajo

### Fase 6: Polish y Launch (Semanas 17-19)
> Calidad, performance, lanzamiento

- [ ] Landing page de marketing (incluir "Importá tu base de datos existente" como selling point)
- [ ] PWA support (instalable en móvil)
- [ ] Performance optimization (React Suspense, lazy loading, image optimization)
- [ ] Responsive final review en móvil/tablet
- [ ] Ejecutar migración completa de Lozanor como validación final del import system
- [ ] Testing E2E (Playwright) — incluir flujo de importación completo
- [ ] Documentación de API + guía de importación de datos
- [ ] Beta launch con Lozanor como primer tenant (datos ya migrados)

---

## Configuración de Infraestructura

### Railway

```
┌─────────────────────────────────┐
│          Railway Project         │
├─────────────────────────────────┤
│  Service: serviflow-app         │
│  - Next.js (Dockerfile)        │
│  - Port: 3000                  │
│  - Auto-deploy from GitHub     │
│                                 │
│  Service: PostgreSQL            │
│  - Railway Managed              │
│  - Auto-backups                │
│                                 │
│  Service: Redis (Upstash)       │
│  - Rate limiting               │
│  - Session cache               │
│                                 │
│  Cron Jobs:                     │
│  - Reminder emails (*/15 min)  │
│  - Archive old visits (daily)  │
│  - Subscription checks (daily) │
└─────────────────────────────────┘
```

### Variables de Entorno

```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/serviflow"

# Auth
NEXTAUTH_URL="https://serviflow.app"
NEXTAUTH_SECRET="generated-secret"

# Email
RESEND_API_KEY="re_xxxxx"

# Payments
MERCADOPAGO_ACCESS_TOKEN="xxx"
STRIPE_SECRET_KEY="sk_xxx"

# AI (defaults, tenants can override)
GROQ_API_KEY="gsk_xxx"
GEMINI_API_KEY="xxx"

# Monitoring
SENTRY_DSN="https://xxx@sentry.io/xxx"

# Redis
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxx"
```

---

## Mapeo de Features: App Actual → ServiFlow

| Feature Actual | Ubicación Actual | Implementación ServiFlow |
|---|---|---|
| Login con PIN | `LoginScreen` + `apiLogin` | Auth.js credentials + bcrypt + JWT cookie |
| Auto-registro cliente | `LoginScreen (REGISTER)` | `/register` page con link público por tenant |
| Bootstrap admin | `apiBootstrap` | Seed script + onboarding wizard |
| Agenda | Tab AGENDA | `/dashboard/agenda` + FullCalendar + VisitCard |
| Solicitudes | Tab SOLICITUDES | `/dashboard/requests` + DataTable + workflow |
| Pendientes | Tab PENDIENTES | `/dashboard/pending` + SQL queries optimizadas |
| Clientes | Tab CLIENTES | `/dashboard/clients` + ClientTable + detail page |
| Finanzas | Tab FINANZAS | `/dashboard/finance` + charts (Recharts) |
| Historial | Tab HISTORIAL | `/dashboard/history` + paginación server-side |
| Notas y alarmas | Tab NOTAS | `/dashboard/notes` + Inngest cron para emails |
| Recomendador IA | Tab RECOMENDADOR | `/dashboard/ai-advisor` + Vercel AI SDK |
| KPI Cards | Dashboard metrics | KPICard + server-side aggregations |
| Google Calendar | `syncVisitRowToGoogleCalendar_` | `calendar.service.ts` + Google Calendar API |
| Haversine distances | `haversineKm_` | `geo.service.ts` (misma fórmula) |
| Soft delete | `deletedAt` en todas las tablas | Prisma middleware global de soft delete |
| Permisos ADMIN2 | `admin2Permissions` string | JSONB `permissions` con UI de checkboxes |
| Auto-refresh 2 min | `setInterval` en `App` | TanStack Query `refetchInterval` |
| Toast notifications | `ToastProvider` | shadcn/ui `Toaster` (Sonner) |
| Confirm dialogs | `ConfirmProvider` | shadcn/ui `AlertDialog` |
| Archive by year | `archiveVisitsByYear_` | `archive.service.ts` + partitioned tables |
| Google Sheets DB | Toda la data vive en Sheets | 🆕 **Import Wizard**: migración self-service desde CSV/Excel/Sheets |

---

## Verification Plan

### Automated Tests
```bash
# Unit tests (Vitest)
npm run test

# Integration tests (Prisma + PostgreSQL testcontainers)
npm run test:integration

# E2E tests (Playwright)
npm run test:e2e

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Manual Verification
1. **Onboarding flow**: Registrar un nuevo negocio, completar wizard, crear primer cliente y visita
2. **Multi-tenant isolation**: Verificar que Tenant A no puede ver datos de Tenant B
3. **Role permissions**: Probar cada rol (OWNER, ADMIN, OPERATOR, CLIENT) y verificar accesos
4. **Visit lifecycle**: Crear → Confirmar → Completar visita y verificar auto-generación de transacción
5. **AI recommendation**: Ejecutar recomendación con datos reales de Lozanor
6. **Mobile responsive**: Probar en dispositivos móviles reales (iOS Safari, Android Chrome)
7. **🆕 Import CSV**: Subir un CSV de clientes de prueba → verificar mapeo → importar → verificar en DB
8. **🆕 Import Excel**: Subir un .xlsx con múltiples hojas → importar Clientes + Visitas en batch
9. **🆕 Import Google Sheets**: Conectar la planilla real de Lozanor → importar todos los datos → verificar integridad total
10. **🆕 Migración Lozanor completa**: Ejecutar migración full y comparar conteo de registros vs planilla original

---

> [!TIP]
> **Lozanor como "Tenant 0"**: La primera instancia de la plataforma será la migración de Lozanor usando el propio sistema de importación, que servirá como caso de prueba real y referencia para validar que tanto las funcionalidades como el importador están correctamente implementados.

---

## 🆕 Sistema de Importación de Datos (Detalle Completo)

Esta funcionalidad es **doble propósito**: sirve para migrar Lozanor (caso específico) y como feature self-service para cualquier negocio nuevo que quiera subir su base de datos existente.

### Visión General

```mermaid
flowchart TB
    A["Paso 1: Subir archivo"] --> B["Paso 2: Seleccionar hoja"]
    B --> C["Paso 3: Mapear columnas"]
    C --> D["Paso 4: Preview + Validar"]
    D --> E["Paso 5: Ejecutar importación"]
    E --> F["Paso 6: Reporte de resultados"]

    subgraph "Formatos soportados"
        G[CSV]
        H[Excel .xlsx]
        I[Google Sheets URL]
        J[JSON - API]
    end

    subgraph "Entidades importables"
        K[Clientes]
        L[Visitas / Trabajos]
        M[Transacciones]
        N[Notas]
    end

    G & H & I & J --> A
    E --> K & L & M & N
```

### Wizard de Importación (6 pasos)

#### Paso 1: Subir Archivo
- **Drag & drop** o selector de archivos
- Formatos: `.csv`, `.xlsx`, `.xls`, `.json`
- **Google Sheets**: pegar URL pública o conectar con OAuth de Google
- Límite Free: 50 filas, 1 importación | Pro/Business: ilimitado
- Tamaño máximo: 10MB (Pro), 50MB (Business)

#### Paso 2: Seleccionar Hoja y Entidad
- Si el archivo tiene múltiples hojas (Excel/Sheets), mostrar selector
- Elegir la entidad destino: **Clientes**, **Visitas**, **Transacciones**, **Notas**
- Opción de importar múltiples hojas a distintas entidades en un mismo batch

#### Paso 3: Mapeo Inteligente de Columnas

Este es el paso clave que hace que la importación sea **universal** para cualquier negocio:

```typescript
// mappers.ts - Auto-detección de columnas
const COLUMN_SIGNATURES: Record<string, ColumnSignature> = {
  // Clientes
  'client.name': {
    aliases: ['nombre', 'name', 'cliente', 'client', 'razón social', 'razon social'],
    type: 'string',
    required: true,
  },
  'client.email': {
    aliases: ['email', 'correo', 'e-mail', 'mail', 'correo electrónico'],
    type: 'email',
    required: false,
  },
  'client.phone': {
    aliases: ['teléfono', 'telefono', 'phone', 'tel', 'celular', 'móvil', 'movil', 'whatsapp'],
    type: 'phone',
    required: false,
  },
  'client.address': {
    aliases: ['dirección', 'direccion', 'address', 'domicilio', 'ubicación', 'ubicacion'],
    type: 'string',
    required: false,
  },
  // Visitas
  'visit.date': {
    aliases: ['fecha', 'date', 'día', 'dia', 'fecha visita', 'fecha servicio'],
    type: 'date',
    required: true,
  },
  'visit.status': {
    aliases: ['estado', 'status', 'situación', 'situacion'],
    type: 'enum',
    required: false,
    enumMap: {
      // Mapeo flexible de valores
      'realizada|completada|hecha|done|completed': 'COMPLETED',
      'programada|agendada|scheduled|pendiente': 'PENDING_CONFIRM',
      'confirmada|confirmed': 'CONFIRMED',
      'cancelada|cancelled|canceled': 'CANCELLED',
    }
  },
  'visit.price': {
    aliases: ['precio', 'price', 'monto', 'valor', 'importe', 'costo', 'tarifa'],
    type: 'currency',
    required: false,
  },
  // ... más campos
};

// Auto-mapeo: compara headers del archivo contra aliases conocidos
function autoMapColumns(fileHeaders: string[], targetEntity: string): ColumnMapping[] {
  return fileHeaders.map(header => {
    const normalizedHeader = header.toLowerCase().trim();
    const match = Object.entries(COLUMN_SIGNATURES)
      .filter(([key]) => key.startsWith(targetEntity))
      .find(([_, sig]) => sig.aliases.some(alias =>
        normalizedHeader.includes(alias) || alias.includes(normalizedHeader)
      ));

    return {
      sourceColumn: header,
      targetField: match ? match[0] : null,  // null = no mapeado
      confidence: match ? 'auto' : 'manual',
      ignored: !match,
    };
  });
}
```

**UI del mapeo:**
- Tabla de 3 columnas: `Columna del archivo` → `Campo en ServiFlow` → `Preview de datos`
- Los campos auto-detectados se muestran con ✅ verde
- Los campos sin mapear se muestran con ⚠️ amarillo (el usuario puede asignarlos manualmente con un dropdown)
- Los campos requeridos sin mapear se muestran con ❌ rojo
- Botón "Ignorar columna" para datos que no se quieren importar

#### Paso 4: Preview y Validación

```typescript
// validators.ts - Validación fila por fila
interface ValidationResult {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  issues: {
    row: number;
    field: string;
    type: 'error' | 'warning';
    message: string;
    originalValue: string;
    suggestedFix?: string;
  }[];
}

// Ejemplo de validaciones:
// - Email inválido → warning (se importa sin email)
// - Fecha no parseable → error (fila rechazada)
// - Teléfono con formato raro → warning (se normaliza automáticamente)
// - Nombre vacío → error (campo requerido)
// - Precio negativo → warning (se importa como 0)
// - Duplicado por nombre+dirección → warning (posible duplicado)
```

**UI del preview:**
- Vista tabla con las primeras 20 filas mapeadas a los campos de ServiFlow
- Resumen: "150 filas válidas ✅, 3 con warnings ⚠️, 2 con errores ❌"
- Expandir errores/warnings para ver detalle por fila
- Opción: "Importar solo filas válidas" o "Corregir y reintentar"

#### Paso 5: Ejecución de la Importación

```typescript
// import.service.ts
async function executeImport(job: ImportJob): Promise<ImportResult> {
  const { tenantId, entityType, mappedRows, userId } = job;

  // Transacción atómica: todo o nada
  return await prisma.$transaction(async (tx) => {
    let imported = 0;
    let skipped = 0;
    const errors: ImportError[] = [];

    for (const [index, row] of mappedRows.entries()) {
      try {
        // Verificar duplicados
        const existing = await findDuplicate(tx, tenantId, entityType, row);
        if (existing) {
          // Estrategia configurable: skip, update, o crear nuevo
          if (job.duplicateStrategy === 'SKIP') {
            skipped++;
            continue;
          }
          if (job.duplicateStrategy === 'UPDATE') {
            await updateEntity(tx, tenantId, entityType, existing.id, row);
            imported++;
            continue;
          }
        }

        // Crear entidad
        await createEntity(tx, tenantId, entityType, row);
        imported++;

        // Reportar progreso via SSE
        reportProgress(job.id, { imported, total: mappedRows.length });
      } catch (err) {
        errors.push({ row: index, error: err.message });
      }
    }

    // Log en audit_logs
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'IMPORT',
        entityType,
        changes: { imported, skipped, errors: errors.length },
      }
    });

    // Guardar resultado en import_history
    await tx.importHistory.create({
      data: {
        tenantId,
        userId,
        entityType,
        fileName: job.fileName,
        totalRows: mappedRows.length,
        importedRows: imported,
        skippedRows: skipped,
        errorRows: errors.length,
        errors: errors as any,
        status: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
      }
    });

    return { imported, skipped, errors };
  });
}
```

**UI durante ejecución:**
- Barra de progreso animada con conteo: "Importando 47 de 150..."
- Log en tiempo real via Server-Sent Events (SSE)
- Botón "Cancelar" (rollback de la transacción)

#### Paso 6: Reporte de Resultados
- Resumen visual: ✅ 148 importados, ⏭️ 2 omitidos (duplicados), ❌ 0 errores
- Botón "Ver datos importados" → redirige a la tabla correspondiente (Clientes, Visitas, etc.)
- Botón "Deshacer importación" (soft-delete batch por `importJobId`)
- El resultado queda registrado en el historial de importaciones

### Tabla adicional: `import_history`

```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID FK -> tenants.id NOT NULL
user_id             UUID FK -> users.id NOT NULL
entity_type         VARCHAR(50) NOT NULL  -- 'clients', 'visits', 'transactions', 'notes'
file_name           VARCHAR(255)
file_type           VARCHAR(10)  -- 'csv', 'xlsx', 'google_sheets', 'json'
total_rows          INT NOT NULL
imported_rows       INT NOT NULL
skipped_rows        INT DEFAULT 0
error_rows          INT DEFAULT 0
errors              JSONB  -- detalle de errores por fila
column_mapping      JSONB  -- mapeo usado (para re-importar)
duplicate_strategy  VARCHAR(20) DEFAULT 'SKIP'  -- 'SKIP', 'UPDATE', 'CREATE_NEW'
status              ENUM('PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','ROLLED_BACK')
started_at          TIMESTAMPTZ DEFAULT NOW()
completed_at        TIMESTAMPTZ
INDEX(tenant_id, created_at)
```

### Caso Especial: Migración de Lozanor

Para la migración de Lozanor, se usa el mismo sistema de importación pero con un **script dedicado** que:

```typescript
// scripts/migrate-lozanor.ts
async function migrateLozanor() {
  // 1. Conectar a la Google Sheet de Lozanor (por ID o URL)
  const sheets = await connectGoogleSheet(LOZANOR_SPREADSHEET_ID);

  // 2. Crear tenant "Lozanor Fumigaciones"
  const tenant = await createTenant({
    name: 'Lozanor Fumigaciones',
    slug: 'lozanor',
    industry: 'fumigacion',
    timezone: 'America/Argentina/Buenos_Aires',
    currency: 'ARS',
  });

  // 3. Importar cada hoja con mapeo pre-configurado
  const LOZANOR_MAPPINGS = {
    'Clients': {
      // Mapeo exacto de columnas de la planilla Lozanor
      'name': 'client.name',
      'email': 'client.email',
      'phone': 'client.phone',
      'address': 'client.address',
      'lat': 'client.lat',
      'lng': 'client.lng',
      'status': 'client.status',
      'relationshipType': 'client.relationship_type',
      'pestTypes': 'client.service_types',
      'preferredDays': 'client.preferred_days',
      'preferredSlots': 'client.preferred_slots',
    },
    'Users': { /* mapeo de usuarios */ },
    'Visits': { /* mapeo de visitas activas */ },
    'Visits_2024': { /* visitas archivadas 2024 */ },
    'Visits_2025': { /* visitas archivadas 2025 */ },
    'Requests': { /* solicitudes */ },
    'Transactions': { /* movimientos financieros */ },
    'Notes': { /* notas y alarmas */ },
  };

  // 4. Ejecutar importación tabla por tabla
  for (const [sheetName, mapping] of Object.entries(LOZANOR_MAPPINGS)) {
    const data = await sheets.readSheet(sheetName);
    await importService.executeImport({
      tenantId: tenant.id,
      entityType: mapping.entity,
      mappedRows: applyMapping(data, mapping),
      duplicateStrategy: 'SKIP',
    });
  }

  // 5. Migrar configuración del tenant
  await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      baseAddress: 'Magallanes 1090, San Isidro',
      baseLat: -34.4716,
      baseLng: -58.5298,
      aiProvider: 'groq',
      calendarEventTitlePrefix: 'Lozanor',
      calendarEventDuration: 45,
      visitIntervalDays: 15,
      workingHoursStart: '07:00',
      workingHoursEnd: '15:00',
    }
  });

  // 6. Crear usuario OWNER para el admin actual
  await createOwnerUser(tenant.id, {
    email: 'javiernoriega0@gmail.com',
    name: 'Admin Lozanor',
    password: 'temp-password-change-on-first-login',
  });

  console.log('✅ Migración Lozanor completada');
}
```

### Templates de Importación por Industria

Para facilitar la importación a negocios nuevos, ofrecemos **templates descargables** con la estructura esperada:

| Industria | Template CSV | Columnas |
|-----------|-------------|----------|
| Fumigación | `template_fumigacion.csv` | Nombre, Dirección, Teléfono, Email, Tipo de Plaga, Tipo (Abono/Especial) |
| Jardinería | `template_jardineria.csv` | Nombre, Dirección, Teléfono, Email, Tipo de Servicio, Frecuencia |
| Limpieza Piletas | `template_piletas.csv` | Nombre, Dirección, Teléfono, Email, Tipo de Pileta, Último Servicio |
| Limpieza Tanques | `template_tanques.csv` | Nombre, Dirección, Teléfono, Email, Capacidad, Último Servicio |
| Genérico | `template_generico.csv` | Nombre, Dirección, Teléfono, Email, Tipo de Servicio, Notas |

El usuario puede descargar el template, llenarlo con sus datos, y subirlo al wizard para una importación guiada.
