import { router } from './trpc';
import { authRouter } from './routers/auth';
import { clientsRouter } from './routers/clients';
import { visitsRouter } from './routers/visits';

// Placeholder routers for remaining requirements
const placeholderRouter = router({});

export const appRouter = router({
  auth: authRouter,
  clients: clientsRouter,
  visits: visitsRouter,
  requests: placeholderRouter,
  transactions: placeholderRouter,
  notes: placeholderRouter,
  users: placeholderRouter,
  tenant: placeholderRouter,
  ai: placeholderRouter,
  import: placeholderRouter,
});

export type AppRouter = typeof appRouter;
