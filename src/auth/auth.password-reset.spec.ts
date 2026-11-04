import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

const setup = (overrides: any = {}) => {
  const user: any = { id: 'u1', email: 'pat@test.local', name: 'Pat', password: 'old-hash', otpCode: null, otpExpires: null, ...overrides };
  let found: any = user;
  const repository = {
    createQueryBuilder: () => ({ where: () => ({ getOne: async () => found }) }),
    save: jest.fn(async (x: any) => x),
  };
  const email = { sendPasswordResetCode: jest.fn(async () => undefined) };
  const service = new AuthService(repository as any, {} as any, email as any, {} as any);
  return { service, user, repository, email, noUser: () => { found = null; } };
};
const request = async (ctx: ReturnType<typeof setup>) => {
  await ctx.service.forgotPassword({ email: ctx.user.email });
  return (ctx.email.sendPasswordResetCode.mock.calls[0] as any[])[1] as string;
};
const wrongFor = (code: string) => (code === '111111' ? '222222' : '111111');

describe('forgot password', () => {
  it('gives the same answer for unknown and known emails, and only emails real accounts', async () => {
    const known = setup();
    const unknown = setup();
    unknown.noUser();
    const a = await known.service.forgotPassword({ email: known.user.email });
    const b = await unknown.service.forgotPassword({ email: 'nobody@test.local' });
    expect(a).toEqual(b);
    expect(unknown.email.sendPasswordResetCode).not.toHaveBeenCalled();
    expect(known.email.sendPasswordResetCode).toHaveBeenCalledTimes(1);
  });

  it('does not email deactivated accounts', async () => {
    const ctx = setup({ isActive: false });
    await ctx.service.forgotPassword({ email: ctx.user.email });
    expect(ctx.email.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  it('sends six digits and never stores the code itself', async () => {
    const ctx = setup();
    const code = await request(ctx);
    expect(code).toMatch(/^\d{6}$/);
    expect(ctx.user.otpCode).not.toContain(code);
    // users.otpCode is VARCHAR(10) in production; anything longer fails for real accounts
    expect(ctx.user.otpCode.length).toBeLessThanOrEqual(10);
  });

  it('waits a minute before sending another code', async () => {
    const ctx = setup();
    await request(ctx);
    await ctx.service.forgotPassword({ email: ctx.user.email });
    expect(ctx.email.sendPasswordResetCode).toHaveBeenCalledTimes(1);
  });

  it('refuses a password reset with the wrong code, even after a reset was requested', async () => {
    const ctx = setup();
    const code = await request(ctx);
    await expect(ctx.service.resetPasswordWithOtp({ email: ctx.user.email, otp: wrongFor(code), password: 'attacker-pass' })).rejects.toThrow(BadRequestException);
    expect(ctx.user.password).toBe('old-hash');
  });

  it('resets with the right code, and the code works only once', async () => {
    const ctx = setup();
    const code = await request(ctx);
    await ctx.service.verifyOtp({ email: ctx.user.email, otp: code });
    await ctx.service.resetPasswordWithOtp({ email: ctx.user.email, otp: code, password: 'new-password' });
    expect(ctx.user.password).not.toBe('old-hash');
    expect(ctx.user.otpCode).toBeNull();
    await expect(ctx.service.resetPasswordWithOtp({ email: ctx.user.email, otp: code, password: 'again-password' })).rejects.toThrow(BadRequestException);
  });

  it('cancels the code after five wrong tries, so the right one stops working', async () => {
    const ctx = setup();
    const code = await request(ctx);
    for (let i = 0; i < 4; i++) {
      await expect(ctx.service.verifyOtp({ email: ctx.user.email, otp: wrongFor(code) })).rejects.toThrow('wrong or has expired');
    }
    await expect(ctx.service.verifyOtp({ email: ctx.user.email, otp: wrongFor(code) })).rejects.toThrow('Too many wrong tries');
    await expect(ctx.service.verifyOtp({ email: ctx.user.email, otp: code })).rejects.toThrow(BadRequestException);
  });

  it('refuses an expired code', async () => {
    const ctx = setup();
    const code = await request(ctx);
    ctx.user.otpExpires = new Date(Date.now() - 1000);
    await expect(ctx.service.verifyOtp({ email: ctx.user.email, otp: code })).rejects.toThrow(BadRequestException);
  });
});
