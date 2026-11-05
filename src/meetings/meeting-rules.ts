/** Pure meeting rules, unit tested in meeting-rules.spec.ts. */
import { MeetingStatus } from './entities/meeting.entity';

/** A call that was never ended leaves "Upcoming" this long after its planned finish. */
export const STALE_AFTER_MS = 4 * 60 * 60 * 1000;
/** A guest who has not checked in for this long has closed the tab. */
export const GUEST_GONE_AFTER_MS = 30 * 1000;

export const isClosed = (status: MeetingStatus) => status === 'ended' || status === 'cancelled';

export const canJoin = (m: { status: MeetingStatus }) => !isClosed(m.status);

export const isGuestPresent = (lastSeenAt: Date, now = new Date()) =>
  now.getTime() - lastSeenAt.getTime() < GUEST_GONE_AFTER_MS;

/** Removes duplicates and the host, who is never an invitee. */
export const cleanInvitees = (ids: string[] | undefined, hostId: string) =>
  [...new Set(ids ?? [])].filter((id) => id !== hostId);
