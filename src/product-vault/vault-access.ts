import { createHash, randomBytes } from 'crypto';
import { UserRole } from '../users/entities/user.entity';

/** Roles that can reveal, copy and share every vault item. */
export const VAULT_ADMIN_ROLES: string[] = [UserRole.FOUNDER_CEO, UserRole.PROJECT_MANAGER];

export const REVEAL_FORBIDDEN_MESSAGE = 'Only people on this product can see this password.';
export const EDIT_FORBIDDEN_MESSAGE = 'Only people on this product can change or delete this password.';
export const SHARE_GONE_MESSAGE =
  'This link has expired or was already used. Ask the person who sent it for a new one.';

/**
 * Reveal / copy / share rule: the product owner, a product team member,
 * or anyone with role FOUNDER/CEO or Project Manager.
 */
export function canRevealCredential(input: {
  userId: string | null | undefined;
  role: string | null | undefined;
  productOwnerId: string | null | undefined;
  isMember: boolean;
}): boolean {
  if (!input.userId) return false;
  if (input.productOwnerId && input.productOwnerId === input.userId) return true;
  if (input.isMember) return true;
  return !!input.role && VAULT_ADMIN_ROLES.includes(input.role);
}

/** 32 random bytes, base64url (43 chars). Shown once in the share URL, never stored. */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex of the token; this is what the database stores and looks up. */
export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Cheap shape check before touching the database. */
export function isWellFormedShareToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const SHARE_DURATIONS_MS: Record<'1h' | '24h' | '7d', number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Safe user shape for responses. */
export function safeUser(
  u: { id: string; name: string; avatarUrl?: string | null; role?: string | null } | null | undefined,
) {
  if (!u || !u.id) return null;
  return { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null, role: u.role ?? null };
}

/** TypeORM returns `[rows, rowCount]` for UPDATE/DELETE raw queries and `rows` otherwise. */
export function rowsOf<T = any>(result: any): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0];
  }
  return Array.isArray(result) ? result : [];
}
