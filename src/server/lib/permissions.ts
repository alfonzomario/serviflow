import { Session } from 'next-auth';

export type Role = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'OPERATOR' | 'CLIENT';

/**
 * Granular permission matrix stored in `users.permissions` (JSONB).
 * Only meaningful for the ADMIN role — see docs/implementation_plan.md.
 * Every other role resolves through the hardcoded rules in `checkPermission`.
 */
export type PermissionMatrix = {
  agenda: { read: boolean; write: boolean };
  clients: { read: boolean; write: boolean };
  requests: { read: boolean; write: boolean };
  finance: { read: boolean; write: boolean };
  team: { read: boolean; write: boolean };
  notes: { read: boolean; write: boolean };
  ai: { read: boolean };
  settings: { read: boolean; write: boolean };
  archive: { execute: boolean };
};

export type Module = keyof PermissionMatrix;
export type Action = 'read' | 'write' | 'execute';

export const MODULES: Module[] = [
  'agenda',
  'clients',
  'requests',
  'finance',
  'team',
  'notes',
  'ai',
  'settings',
  'archive',
];

/** Which actions each module actually supports. */
export const MODULE_ACTIONS: Record<Module, Action[]> = {
  agenda: ['read', 'write'],
  clients: ['read', 'write'],
  requests: ['read', 'write'],
  finance: ['read', 'write'],
  team: ['read', 'write'],
  notes: ['read', 'write'],
  ai: ['read'],
  settings: ['read', 'write'],
  archive: ['execute'],
};

export const emptyPermissionMatrix = (): PermissionMatrix => ({
  agenda: { read: false, write: false },
  clients: { read: false, write: false },
  requests: { read: false, write: false },
  finance: { read: false, write: false },
  team: { read: false, write: false },
  notes: { read: false, write: false },
  ai: { read: false },
  settings: { read: false, write: false },
  archive: { execute: false },
});

/**
 * Field-of-work defaults: an operator sees the agenda and can mark visits and
 * leave notes, but never touches money, team or settings.
 */
const OPERATOR_PERMISSIONS: PermissionMatrix = {
  ...emptyPermissionMatrix(),
  agenda: { read: true, write: true },
  clients: { read: true, write: false },
  requests: { read: true, write: false },
  notes: { read: true, write: true },
};

/** Narrows the untyped JSONB column into a usable matrix. */
export const parsePermissions = (value: unknown): PermissionMatrix => {
  const matrix = emptyPermissionMatrix();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return matrix;

  for (const module of MODULES) {
    const stored = (value as Record<string, unknown>)[module];
    if (!stored || typeof stored !== 'object') continue;

    for (const action of MODULE_ACTIONS[module]) {
      if ((stored as Record<string, unknown>)[action] === true) {
        (matrix[module] as Record<string, boolean>)[action] = true;
      }
    }
  }

  return matrix;
};

export const hasRole = (session: Session | null, ...roles: Role[]): boolean => {
  if (!session?.user?.role) return false;
  return roles.includes(session.user.role as Role);
};

export const checkPermission = (
  session: Session | null,
  module: Module,
  action: Action
): boolean => {
  if (!session?.user) return false;
  const role = session.user.role as Role;

  // Platform and business owners bypass the matrix entirely.
  if (role === 'SUPER_ADMIN' || role === 'OWNER') return true;

  if (role === 'ADMIN') {
    const matrix = parsePermissions(session.user.permissions);
    return (matrix[module] as Record<string, boolean | undefined>)[action] === true;
  }

  if (role === 'OPERATOR') {
    return (OPERATOR_PERMISSIONS[module] as Record<string, boolean | undefined>)[action] === true;
  }

  // Clients reach their own records through the client portal, which scopes by
  // clientId rather than by module permissions.
  return false;
};
