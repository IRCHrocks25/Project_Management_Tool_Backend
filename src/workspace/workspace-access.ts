import { UserRole } from '../users/entities/user.entity';

/** Who a company vault item is open to. A department is a `UserRole` value. */
export interface Access {
  everyone: boolean;
  departments: string[];
  userIds: string[];
}

export interface WorkspaceActor {
  userId: string;
  role?: string | null;
}

export interface VaultItemAccessInfo {
  scope: string;
  ownerId: string | null;
  access: Access;
}

export type PagePermission = 'view' | 'edit';
export type PageAccessLevel = 'owner' | PagePermission;

export interface PageShareRule {
  kind: 'everyone' | 'department' | 'user' | string;
  target: string | null;
  permission: PagePermission | string;
}

/** Roles with full access to company vault items. They get nothing extra on personal items or pages. */
const COMPANY_ADMIN_ROLES: string[] = [UserRole.FOUNDER_CEO, UserRole.PROJECT_MANAGER];

export const NO_ACCESS: Access = { everyone: false, departments: [], userIds: [] };

const isCompanyAdmin = (actor: WorkspaceActor) => !!actor.role && COMPANY_ADMIN_ROLES.includes(actor.role);

const isOwner = (actor: WorkspaceActor, ownerId: string | null) => !!actor.userId && !!ownerId && actor.userId === ownerId;

export function matchesAccess(actor: WorkspaceActor, access: Access): boolean {
  if (!actor.userId) return false;
  if (access.everyone) return true;
  if (access.userIds.includes(actor.userId)) return true;
  return !!actor.role && access.departments.includes(actor.role);
}

/** See, reveal, copy, and update fields and password. Product rows are never reachable from here. */
export function canSeeVaultItem(actor: WorkspaceActor, item: VaultItemAccessInfo): boolean {
  if (!actor.userId) return false;
  if (item.scope === 'personal') return isOwner(actor, item.ownerId);
  if (item.scope === 'company') {
    return isOwner(actor, item.ownerId) || isCompanyAdmin(actor) || matchesAccess(actor, item.access);
  }
  return false;
}

/** Delete, and change who has access. */
export function canManageVaultItem(actor: WorkspaceActor, item: VaultItemAccessInfo): boolean {
  if (!actor.userId) return false;
  if (item.scope === 'personal') return isOwner(actor, item.ownerId);
  if (item.scope === 'company') return isOwner(actor, item.ownerId) || isCompanyAdmin(actor);
  return false;
}

/** Duplicates and order don't count as a change. */
export function sameAccess(a: Access, b: Access): boolean {
  const same = (x: string[], y: string[]) => {
    const setX = new Set(x);
    const setY = new Set(y);
    return setX.size === setY.size && [...setX].every((v) => setY.has(v));
  };
  return a.everyone === b.everyone && same(a.departments, b.departments) && same(a.userIds, b.userIds);
}

function shareMatches(actor: WorkspaceActor, share: PageShareRule): boolean {
  if (share.kind === 'everyone') return true;
  if (share.kind === 'department') return !!actor.role && share.target === actor.role;
  if (share.kind === 'user') return share.target === actor.userId;
  return false;
}

/** The owner has everything, otherwise the strongest matching share wins. There is no admin override. */
export function pageAccessLevel(
  actor: WorkspaceActor,
  page: { ownerId: string | null },
  shares: PageShareRule[],
): PageAccessLevel | null {
  if (!actor.userId) return null;
  if (isOwner(actor, page.ownerId)) return 'owner';
  const matching = shares.filter((s) => shareMatches(actor, s));
  if (matching.some((s) => s.permission === 'edit')) return 'edit';
  return matching.some((s) => s.permission === 'view') ? 'view' : null;
}

/** The people a set of shares names directly. `everyone` isn't included, so it never mails the whole company. */
export function namedShareUserIds(
  shares: PageShareRule[],
  users: { id: string; role?: string | null }[],
): Set<string> {
  const ids = new Set<string>();
  for (const user of users) {
    const named = shares.some(
      (s) =>
        (s.kind === 'user' && s.target === user.id) ||
        (s.kind === 'department' && !!user.role && s.target === user.role),
    );
    if (named) ids.add(user.id);
  }
  return ids;
}
