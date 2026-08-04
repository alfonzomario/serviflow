import { cookies } from 'next/headers';
import { auth } from '../auth';
import { db } from '../db';

export const createContext = async () => {
  const session = await auth();
  let tenantId = session?.user?.tenantId ?? null;

  // ── Impersonation para SUPER_ADMIN ───────────────────────
  if (session?.user?.role === 'SUPER_ADMIN') {
    const impersonateCookie = (await cookies()).get('serviflow_impersonate');
    if (impersonateCookie?.value) {
      tenantId = impersonateCookie.value;
    }
  }

  return {
    session,
    db,
    tenantId,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
