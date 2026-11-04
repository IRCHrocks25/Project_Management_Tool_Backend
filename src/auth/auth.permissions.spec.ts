import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const users: Record<string, any> = {
  founder: { id: 'founder', role: UserRole.FOUNDER_CEO, isHeadPM: false },
  head: { id: 'head', role: UserRole.PROJECT_MANAGER, isHeadPM: true },
  pm: { id: 'pm', role: UserRole.PROJECT_MANAGER, isHeadPM: false },
  designer: { id: 'designer', role: UserRole.DESIGNER, isHeadPM: false },
};

const setup = () => {
  const repository = {
    findOne: jest.fn(async ({ where }: any) => (where.id ? users[where.id] || null : null)),
    create: (x: any) => x,
    save: jest.fn(async (x: any) => ({ id: 'new', ...x })),
  };
  return { service: new AuthService(repository as any, {} as any, {} as any, {} as any), repository };
};

const newUser = (role: UserRole) => ({ name: 'New', email: 'New@Test.local ', password: 'long-enough', role });

describe('account permissions', () => {
  it('closes public signup', () => {
    expect(() => new AuthController({} as any).signup()).toThrow(ForbiddenException);
  });

  it.each(['pm', 'designer'])('stops %s from creating accounts', async (actor) => {
    await expect(setup().service.createUser(newUser(UserRole.DESIGNER), actor)).rejects.toThrow(ForbiddenException);
  });

  it('lets a Head PM add a teammate and returns no password or token', async () => {
    const created: any = await setup().service.createUser(newUser(UserRole.DESIGNER), 'head');
    expect(created.email).toBe('new@test.local');
    expect(created.password).toBeUndefined();
    expect(created.token).toBeUndefined();
  });

  it('only lets a Founder grant the Founder role', async () => {
    const { service } = setup();
    await expect(service.createUser(newUser(UserRole.FOUNDER_CEO), 'head')).rejects.toThrow(ForbiddenException);
    await expect(service.updateUserRole('pm', UserRole.FOUNDER_CEO, 'head')).rejects.toThrow(ForbiddenException);
    await expect(service.createUser(newUser(UserRole.FOUNDER_CEO), 'founder')).resolves.toBeTruthy();
  });

  it('stops people promoting themselves', async () => {
    const { service, repository } = setup();
    await expect(service.setHeadPM('pm', true, 'pm')).rejects.toThrow(ForbiddenException);
    await expect(service.setTeamLead('designer', true, 'designer')).rejects.toThrow(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
