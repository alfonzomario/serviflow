import { Session } from 'next-auth';

export type Role = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'OPERATOR' | 'CLIENT';
export type Module = 'agenda' | 'clients' | 'requests' | 'finance' | 'team' | 'notes' | 'ai' | 'settings' | 'archive';
export type Action = 'read' | 'write' | 'delete' | 'manage';

export type Permission = `${Module}.${Action}`;

export const hasRole = (session: Session | null, ...roles: Role[]): boolean => {
  if (!session?.user?.role) return false;
  return roles.includes(session.user.role as Role);
};

export const checkPermission = (session: Session | null, module: Module, action: Action): boolean => {
  if (!session?.user) return false;
  const role = session.user.role as Role;
  
  if (role === 'SUPER_ADMIN' || role === 'OWNER') return true;
  
  const permString = `${module}.${action}` as Permission;
  
  if (role === 'ADMIN') {
    const userPerms = session.user.permissions as Permission[] | undefined;
    return userPerms?.includes(permString) ?? false;
  }
  
  if (role === 'OPERATOR') {
    const operatorPerms: Permission[] = [
      'agenda.read',
      'agenda.write', // May need refinement
      'notes.read',
      'notes.write',
    ];
    return operatorPerms.includes(permString);
  }
  
  if (role === 'CLIENT') {
    // Clients typically only access their own data, which is enforced via IDs rather than broad module permissions
    return false;
  }
  
  return false;
};
