import { router } from './trpc';
import { authRouter } from './routers/auth';
import { clientsRouter } from './routers/clients';
import { visitsRouter } from './routers/visits';
import { jobsRouter } from './routers/jobs';
import { requestsRouter } from './routers/requests';
import { transactionsRouter } from './routers/transactions';
import { notesRouter } from './routers/notes';
import { usersRouter } from './routers/users';
import { tenantRouter } from './routers/tenant';
import { dashboardRouter } from './routers/dashboard';
import { historyRouter } from './routers/history';
import { importRouter } from './routers/import';

// Still to come (see docs/implementation_plan.md): ai, superadmin.
const placeholderRouter = router({});

export const appRouter = router({
  auth: authRouter,
  dashboard: dashboardRouter,
  clients: clientsRouter,
  visits: visitsRouter,
  jobs: jobsRouter,
  requests: requestsRouter,
  transactions: transactionsRouter,
  notes: notesRouter,
  users: usersRouter,
  tenant: tenantRouter,
  history: historyRouter,
  import: importRouter,
  ai: placeholderRouter,
});

export type AppRouter = typeof appRouter;
