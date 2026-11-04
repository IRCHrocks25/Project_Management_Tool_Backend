import { formatTicketKey } from './ticket-key';

describe('formatTicketKey', () => {
  it('joins code and number with a dash', () => {
    expect(formatTicketKey('CF', 12)).toBe('CF-12');
  });

  it('uppercases and trims the code', () => {
    expect(formatTicketKey(' pmt ', 1)).toBe('PMT-1');
  });

  it('rejects a missing code or a bad number', () => {
    expect(() => formatTicketKey('', 1)).toThrow();
    expect(() => formatTicketKey('CF', 0)).toThrow();
    expect(() => formatTicketKey('CF', 1.5)).toThrow();
  });
});
