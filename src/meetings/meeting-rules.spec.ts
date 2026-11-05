import { canJoin, cleanInvitees, isGuestPresent } from './meeting-rules';

const NOW = new Date('2026-11-05T12:00:00Z');

describe('meeting rules', () => {
  it('only blocks joining a closed meeting', () => {
    expect(canJoin({ status: 'live' })).toBe(true);
    expect(canJoin({ status: 'scheduled' })).toBe(true);
    expect(canJoin({ status: 'ended' })).toBe(false);
    expect(canJoin({ status: 'cancelled' })).toBe(false);
  });

  it('drops guests who stopped checking in', () => {
    expect(isGuestPresent(new Date('2026-11-05T11:59:45Z'), NOW)).toBe(true);
    expect(isGuestPresent(new Date('2026-11-05T11:59:00Z'), NOW)).toBe(false);
  });

  it('removes duplicates and the host from invitees', () => {
    expect(cleanInvitees(['a', 'b', 'a', 'host'], 'host')).toEqual(['a', 'b']);
    expect(cleanInvitees(undefined, 'host')).toEqual([]);
  });
});
