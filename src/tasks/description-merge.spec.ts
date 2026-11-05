import { ConflictException } from '@nestjs/common';
import { descriptionText, mergeTaskDescription } from './description-merge';

const log = (note: string) => `--- Status Change ---\nNew Column: Revision\nBy: Sam\nAt: today\nNotes: ${note}`;
const compose = (prose: string, ...blocks: string[]) => [prose, ...blocks].join('\n\n');
const REVISION = '--- Column: Revision ---';
const APPROVAL = '--- Column: For Approval ---';

describe('descriptionText', () => {
  it('ignores history, stage markers and linked-task ids', () => {
    const raw = compose('Brief\n[[LINKED_TARGET_TASK_ID:1]]', log('note'), REVISION);
    expect(descriptionText(raw)).toBe('Brief');
    expect(descriptionText(null)).toBe('');
  });
});

describe('mergeTaskDescription', () => {
  it('stores the save untouched when nobody else changed the task', () => {
    const incoming = compose('Brief', log('mine'));
    expect(mergeTaskDescription('Brief', incoming, 'Brief')).toBe(incoming);
  });

  it('keeps both notes when two people save from the same copy', () => {
    const first = compose('Brief', log('bigger logo'));
    const second = compose('Brief', log('ready for review'));
    const merged = mergeTaskDescription(first, second, 'Brief');
    expect(merged).toBe(compose('Brief', log('bigger logo'), log('ready for review')));
  });

  it('keeps stored history when an older tab sends no starting copy', () => {
    const merged = mergeTaskDescription(compose('Brief', log('newer')), compose('Brief', log('older tab')));
    expect(merged).toBe(compose('Brief', log('newer'), log('older tab')));
  });

  it('keeps forward and return notes as well as status changes', () => {
    const forwarded = '--- Forwarded to Design on 5 Nov ---\nNotes: hero image';
    const merged = mergeTaskDescription(compose('Brief', forwarded), compose('Brief', log('mine')), 'Brief');
    expect(merged).toContain(forwarded);
    expect(merged).toContain(log('mine'));
  });

  it('keeps a newer stage when the save did not change the stage', () => {
    const merged = mergeTaskDescription(compose('Brief', REVISION), compose('Brief', log('mine')), 'Brief');
    expect(merged).toBe(compose('Brief', log('mine'), REVISION));
  });

  it('lets a deliberate stage move replace the stored one', () => {
    const merged = mergeTaskDescription(compose('Brief', REVISION), compose('Brief', APPROVAL), 'Brief');
    expect(merged).toBe(compose('Brief', APPROVAL));
  });

  it('keeps edited text when a stale save only adds history', () => {
    const merged = mergeTaskDescription('New brief', compose('Old brief', log('mine')), 'Old brief');
    expect(merged).toBe(compose('New brief', log('mine')));
  });

  it('keeps edited text when a stale save only adds to the end', () => {
    const merged = mergeTaskDescription('New brief', 'Old brief\n[[LINK:1]]', 'Old brief');
    expect(merged).toBe('New brief\n[[LINK:1]]');
  });

  it('refuses to overwrite when two people rewrote the text', () => {
    expect(() => mergeTaskDescription('Their brief', 'My brief', 'Old brief')).toThrow(ConflictException);
  });

  it('refuses to join two texts written into an empty description', () => {
    expect(() => mergeTaskDescription('Their brief', 'My brief', '')).toThrow(ConflictException);
  });

  it('honours history the saver removed on purpose', () => {
    const base = compose('Brief', log('old'), log('other'));
    expect(mergeTaskDescription(compose(base, log('new')), compose('Brief', log('other')), base)).toBe(
      compose('Brief', log('other'), log('new')),
    );
  });

  it('treats a missing stored description as empty', () => {
    expect(mergeTaskDescription(null, 'Brief', '')).toBe('Brief');
    expect(mergeTaskDescription(null, 'Brief', null)).toBe('Brief');
  });
});
