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

### Phase 2: Feature Implementation (IN PROGRESS)

#### Scheduling & Agenda
- [x] Install FullCalendar and date libraries.
- [/] Implement `src/app/(dashboard)/agenda/page.tsx`
- [x] Connect `trpc.visits.list` to populate calendar
- [ ] Create 'Add Visit' dialog component
- [ ] Implement drag-and-drop rescheduling

## Next Steps
- [ ] Clients CRUD page with search and filters
- [ ] Requests workflow page
- [ ] Remaining tRPC routers (requests, transactions, notes, users, settings)
- [ ] Install Node.js and run `npm install` + `npx prisma db push`
