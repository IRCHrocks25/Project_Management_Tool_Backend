import { BadRequestException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';

export const CLIENT_TOKEN_TYPE = 'drive_client';
export const CLIENT_SESSION = '14d';
export const CLIENT_LINK_DAYS = 30;
export const RESET_CODE_MINUTES = 10;
export const RESET_RESEND_SECONDS = 60;
export const RESET_MAX_ATTEMPTS = 5;
export const LOCK_EVERY_FAILS = 5;
const LOCK_FIRST_MINUTES = 15;
const LOCK_LONGEST_MINUTES = 24 * 60;

/**
 * Client sessions are signed with their own secret. Every team route and socket verifies against JWT_SECRET, so a
 * client token fails all of them without those routes having to know clients exist. Only code that deliberately
 * uses this secret accepts one, which keeps anything added later closed to clients by default.
 */
export function clientTokenSecret(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret).update('drive-client-session-v1').digest('hex');
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Keyed, so a leaked table of 6-digit reset codes can't be read by trying every code. */
export function hashResetCode(secret: string, clientId: string, code: string): string {
  return createHmac('sha256', secret).update(`${clientId}:${code}`).digest('hex');
}

export function cleanClientName(raw: string | undefined | null): string {
  return String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function cleanClientEmail(raw: string | undefined | null): string | null {
  return String(raw ?? '').trim().toLowerCase() || null;
}

/** Codes people would try first: one digit, a run up or down, or a short repeated pattern. */
export function isGuessableCode(code: string): boolean {
  if (/^(\d)\1{5}$/.test(code)) return true;
  if ('0123456789'.includes(code) || '9876543210'.includes(code)) return true;
  return /^(\d\d)\1\1$/.test(code) || /^(\d\d\d)\1$/.test(code);
}

export function assertUsableCode(code: string): void {
  if (!/^\d{6}$/.test(code)) throw new BadRequestException('Your code needs exactly 6 digits.');
  if (isGuessableCode(code)) throw new BadRequestException('That code is too easy to guess. Pick 6 digits that are less of a pattern.');
}

/** Every fifth wrong try locks the account, for twice as long each time, up to a day. Other tries don't lock. */
export function lockMinutesAfter(failedAttempts: number): number {
  if (failedAttempts <= 0 || failedAttempts % LOCK_EVERY_FAILS !== 0) return 0;
  const round = failedAttempts / LOCK_EVERY_FAILS - 1;
  return Math.min(LOCK_FIRST_MINUTES * 2 ** Math.min(round, 10), LOCK_LONGEST_MINUTES);
}
