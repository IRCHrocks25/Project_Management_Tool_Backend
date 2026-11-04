import { UserRole } from '../users/entities/user.entity';
import { ProductVaultService } from './product-vault.service';

const make = (query: jest.Mock) =>
  new ProductVaultService({} as any, {} as any, {} as any, {} as any, { query } as any, {} as any, {} as any);

describe('ProductVaultService.canReveal', () => {
  const product: any = { id: 'p1', ownerId: 'owner' };

  it('treats a missing product_members table as "not a member"', async () => {
    const query = jest.fn().mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    const svc = make(query);
    await expect(svc.canReveal({ userId: 'u1', role: UserRole.DEVELOPER }, product)).resolves.toBe(false);
  });

  it('allows members found in product_members', async () => {
    const svc = make(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(svc.canReveal({ userId: 'u1', role: UserRole.DEVELOPER }, product)).resolves.toBe(true);
  });

  it('skips the member query for owners and admin roles', async () => {
    const query = jest.fn();
    const svc = make(query);
    await expect(svc.canReveal({ userId: 'owner', role: UserRole.DEVELOPER }, product)).resolves.toBe(true);
    await expect(svc.canReveal({ userId: 'u2', role: UserRole.PROJECT_MANAGER }, product)).resolves.toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('rethrows other database errors', async () => {
    const svc = make(jest.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: '57P01' })));
    await expect(svc.canReveal({ userId: 'u1', role: UserRole.DEVELOPER }, product)).rejects.toThrow('boom');
  });
});
