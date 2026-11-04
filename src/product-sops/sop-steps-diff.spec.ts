import { planStepReplace } from './sop-steps-diff';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';
const UNKNOWN = '99999999-9999-9999-9999-999999999999';

describe('planStepReplace', () => {
  it('keeps existing ids, creates new ones and deletes missing ones', () => {
    const plan = planStepReplace([A, B, C], [
      { id: C, text: ' third first ' },
      { text: 'brand new', links: [{ kind: 'url', ref: 'https://x.test', label: 'X' }] },
      { id: A, text: 'first' },
    ]);
    expect(plan.update).toEqual([
      { id: C, position: 1, text: 'third first', links: [] },
      { id: A, position: 3, text: 'first', links: [] },
    ]);
    expect(plan.create).toEqual([
      { position: 2, text: 'brand new', links: [{ kind: 'url', ref: 'https://x.test', label: 'X' }] },
    ]);
    expect(plan.delete).toEqual([B]);
  });

  it('treats an unknown id as a new step', () => {
    const plan = planStepReplace([A], [{ id: UNKNOWN, text: 'x' }]);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([{ position: 1, text: 'x', links: [] }]);
    expect(plan.delete).toEqual([A]);
  });

  it('keeps a repeated id only once', () => {
    const plan = planStepReplace([A], [
      { id: A, text: 'one' },
      { id: A, text: 'two' },
    ]);
    expect(plan.update).toEqual([{ id: A, position: 1, text: 'one', links: [] }]);
    expect(plan.create).toEqual([{ position: 2, text: 'two', links: [] }]);
    expect(plan.delete).toEqual([]);
  });

  it('creates everything when there are no existing steps', () => {
    const plan = planStepReplace([], [{ text: 'a' }, { text: 'b' }]);
    expect(plan.create.map((s) => s.position)).toEqual([1, 2]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  });
});
