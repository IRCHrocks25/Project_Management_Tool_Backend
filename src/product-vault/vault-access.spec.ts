import { createHash } from 'crypto';
import { UserRole } from '../users/entities/user.entity';
import {
  canRevealCredential,
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  rowsOf,
} from './vault-access';

describe('canRevealCredential', () => {
  const base = { userId: 'u1', role: UserRole.DEVELOPER, productOwnerId: 'owner', isMember: false };

  it('allows the product owner', () => {
    expect(canRevealCredential({ ...base, userId: 'owner' })).toBe(true);
  });

  it('allows product team members', () => {
    expect(canRevealCredential({ ...base, isMember: true })).toBe(true);
  });

  it('allows FOUNDER/CEO and Project Manager roles', () => {
    expect(canRevealCredential({ ...base, role: UserRole.FOUNDER_CEO })).toBe(true);
    expect(canRevealCredential({ ...base, role: UserRole.PROJECT_MANAGER })).toBe(true);
  });

  it('denies everyone else', () => {
    expect(canRevealCredential(base)).toBe(false);
    expect(canRevealCredential({ ...base, role: UserRole.DESIGNER })).toBe(false);
    expect(canRevealCredential({ ...base, role: null })).toBe(false);
  });

  it('denies when there is no user, even if the product has no owner', () => {
    expect(canRevealCredential({ ...base, userId: null, productOwnerId: null })).toBe(false);
    expect(canRevealCredential({ ...base, userId: undefined, role: UserRole.FOUNDER_CEO })).toBe(false);
  });

  it('does not treat a missing owner as a match', () => {
    expect(canRevealCredential({ ...base, productOwnerId: null })).toBe(false);
  });
});

describe('share tokens', () => {
  it('generates 32-byte base64url tokens that are unique', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(isWellFormedShareToken(a)).toBe(true);
  });

  it('hashes with sha256 hex and never returns the token', () => {
    const t = generateShareToken();
    const h = hashShareToken(t);
    expect(h).toBe(createHash('sha256').update(t).digest('hex'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashShareToken(t)).toBe(h);
    expect(hashShareToken(generateShareToken())).not.toBe(h);
  });

  it('rejects malformed tokens', () => {
    expect(isWellFormedShareToken('')).toBe(false);
    expect(isWellFormedShareToken('abc')).toBe(false);
    expect(isWellFormedShareToken('a'.repeat(42) + '=')).toBe(false);
    expect(isWellFormedShareToken(undefined)).toBe(false);
  });
});

describe('rowsOf', () => {
  it('handles both TypeORM raw result shapes', () => {
    expect(rowsOf([[{ id: 1 }], 1])).toEqual([{ id: 1 }]);
    expect(rowsOf([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(rowsOf(undefined)).toEqual([]);
  });
});
