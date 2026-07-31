import { auth } from '../auth';
import { db } from '../db';

export const createContext = async () => {
  const session = await auth();
  const tenantId = session?.user?.tenantId ?? null;

  return {
    session,
    db,
    tenantId,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
