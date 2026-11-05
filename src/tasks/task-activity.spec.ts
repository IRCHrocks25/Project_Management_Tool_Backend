import { recordTaskActivity } from './task-activity';

const entry = { taskId: 't1', action: 'description_edited' as const, actorId: 'u1', details: { before: 'a', after: 'b' } };

const emWith = (savepoint: Record<string, jest.Mock>) =>
  ({ transaction: jest.fn(async (run: (em: any) => Promise<void>) => run(savepoint)) }) as any;

describe('recordTaskActivity', () => {
  it('stores who made the change by name, so it outlives the account', async () => {
    const savepoint = { findOne: jest.fn(async () => ({ id: 'u1', name: 'Dana' })), insert: jest.fn(async () => undefined) };
    await recordTaskActivity(emWith(savepoint), entry);
    expect(savepoint.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: 't1', actorId: 'u1', actorName: 'Dana', details: entry.details }),
    );
  });

  it("doesn't fail the person's save when the record can't be written", async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const savepoint = { findOne: jest.fn(async () => null), insert: jest.fn(async () => { throw new Error('no table'); }) };
    await expect(recordTaskActivity(emWith(savepoint), entry)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
