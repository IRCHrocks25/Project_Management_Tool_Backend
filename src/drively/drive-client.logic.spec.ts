import { JwtService } from '@nestjs/jwt';
import { assertUsableCode, clientTokenSecret, isGuessableCode, lockMinutesAfter } from './drive-client.logic';

describe('client tokens', () => {
  const jwt = new JwtService({});
  const staffSecret = 'staff-secret';
  const clientSecret = clientTokenSecret(staffSecret);

  it('are rejected by anything checking the team secret, so team routes and sockets stay closed', () => {
    const clientToken = jwt.sign({ sub: 'c1', typ: 'drive_client', tv: 1 }, { secret: clientSecret });
    expect(() => jwt.verify(clientToken, { secret: staffSecret })).toThrow();
  });

  it('cannot be made by someone holding a team token', () => {
    const staffToken = jwt.sign({ sub: 'u1', typ: 'drive_client', tv: 1 }, { secret: staffSecret });
    expect(() => jwt.verify(staffToken, { secret: clientSecret })).toThrow();
  });

  it('use a secret that differs from, and depends on, the team secret', () => {
    expect(clientSecret).not.toEqual(staffSecret);
    expect(clientTokenSecret('other')).not.toEqual(clientSecret);
  });
});

describe('6-digit codes', () => {
  it.each(['000000', '111111', '123456', '654321', '012345', '987654', '121212', '123123'])('refuses %s', (code) => {
    expect(isGuessableCode(code)).toBe(true);
    expect(() => assertUsableCode(code)).toThrow();
  });

  it.each(['482915', '730164', '190283'])('accepts %s', (code) => {
    expect(isGuessableCode(code)).toBe(false);
    expect(() => assertUsableCode(code)).not.toThrow();
  });

  it.each(['12345', '1234567', 'abcdef', ''])('refuses the wrong shape: %s', (code) => {
    expect(() => assertUsableCode(code)).toThrow();
  });
});

describe('lockout', () => {
  it('does nothing until the fifth wrong try', () => {
    [0, 1, 2, 3, 4, 6, 9].forEach((n) => expect(lockMinutesAfter(n)).toBe(0));
  });

  it('doubles every five wrong tries, up to a day', () => {
    expect(lockMinutesAfter(5)).toBe(15);
    expect(lockMinutesAfter(10)).toBe(30);
    expect(lockMinutesAfter(15)).toBe(60);
    expect(lockMinutesAfter(50)).toBe(1440);
    expect(lockMinutesAfter(5000)).toBe(1440);
  });
});
