# ServiFlow 🚀

**Plataforma SaaS multi-tenant para negocios de servicios a domicilio.**

Fumigación, jardinería, limpieza de piletas, tanques, mantenimiento y más. Cada negocio obtiene su propia instancia personalizada con agenda, clientes, finanzas, y recomendador IA.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: Auth.js v5 (NextAuth)
- **API**: tRPC v11 (type-safe)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **State**: TanStack Query (React Query)
- **i18n**: next-intl (ES/EN)
- **AI**: Vercel AI SDK (Groq + Gemini)
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Railway managed)
- npm or pnpm

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/serviflow.git
cd serviflow

# Install dependencies
npm install

# Copy env vars
cp .env.example .env.local
# Edit .env.local with your database URL and secrets

# Push database schema
npx prisma db push

# Seed initial data
npx prisma db seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret for JWT signing |
| `NEXTAUTH_URL` | App URL (http://localhost:3000 in dev) |

## Project Structure

```
serviflow/
├── prisma/              # Database schema & migrations
├── messages/            # i18n translation files (es/en)
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── (auth)/      # Login, Register
│   │   ├── (dashboard)/ # Main app (role-based)
│   │   └── api/         # API routes (auth, tRPC)
│   ├── components/      # React components
│   │   ├── ui/          # shadcn/ui base components
│   │   ├── layout/      # Sidebar, Header
│   │   ├── dashboard/   # KPI cards, charts
│   │   └── shared/      # StatusBadge, EmptyState, etc.
│   ├── server/          # Server-side code
│   │   ├── auth.ts      # Auth.js configuration
│   │   ├── db.ts        # Prisma client
│   │   ├── trpc/        # tRPC routers & middleware
│   │   ├── services/    # Business logic layer
│   │   └── lib/         # Utilities (RBAC, dates, geo)
│   ├── lib/             # Client-side utilities
│   └── i18n/            # Internationalization config
└── scripts/             # Migration & seed scripts
```

## Architecture

### Multi-Tenant
Every business is a **tenant** with isolated data. All queries are automatically scoped by `tenantId` through Prisma middleware.

### Role-Based Access
| Role | Access |
|------|--------|
| SUPER_ADMIN | Global platform management |
| OWNER | Full access to their business |
| ADMIN | Configurable per-module permissions |
| OPERATOR | Agenda + Notes |
| CLIENT | Own visits + requests |

### Key Features
- 📅 **Agenda**: Calendar & list views, visit lifecycle management
- 👥 **Clients**: CRM with geolocation, contract types
- 📋 **Requests**: Client service request workflow
- ⏰ **Pending**: Auto-detect missing monthly visits
- 💰 **Finance**: Income/expense ledger, auto-sync with visits
- 📊 **History**: Searchable visit archive by year
- 📝 **Notes**: Internal memos with email alarms
- 🤖 **AI Advisor**: Route optimization with Groq/Gemini
- 📥 **Import**: Bulk data import from CSV/Excel/Google Sheets
- 🏢 **Multi-tenant**: Each business gets customized branding

## License

Private - All rights reserved.
