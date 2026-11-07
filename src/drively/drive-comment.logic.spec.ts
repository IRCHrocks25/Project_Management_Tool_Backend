import { cleanAnchor, cleanCommentBody, commentSnippet } from './drive-comment.logic';
import { canComment, canEdit, driveAccessLevel } from './drively.logic';

describe('the "can comment" level', () => {
  const me = { userId: 'me', role: 'Designer' };
  const share = (permission: string) => ({ kind: 'user', target: 'me', permission });

  it('gives access, unlike the rules for Pages, which only know view and edit', () => {
    expect(driveAccessLevel(me, [{ ownerId: 'x', shares: [share('comment')] }])).toBe('comment');
  });

  it('sits between view and edit', () => {
    expect(driveAccessLevel(me, [{ ownerId: 'x', shares: [share('view'), share('comment')] }])).toBe('comment');
    expect(driveAccessLevel(me, [{ ownerId: 'x', shares: [share('comment')] }, { ownerId: 'y', shares: [share('edit')] }])).toBe('edit');
  });

  it('comes down from a folder', () => {
    expect(driveAccessLevel(me, [{ ownerId: 'x', shares: [] }, { ownerId: 'y', shares: [share('comment')] }])).toBe('comment');
  });

  it('never allows editing', () => {
    expect(canEdit('comment')).toBe(false);
    expect(canComment('comment')).toBe(true);
    expect(canComment('edit')).toBe(true);
    expect(canComment('owner')).toBe(true);
    expect(canComment('view')).toBe(false);
    expect(canComment(null)).toBe(false);
  });
});

describe('comment text', () => {
  it('is trimmed and keeps line breaks', () => {
    expect(cleanCommentBody('  one\r\ntwo  ')).toBe('one\ntwo');
  });

  it('refuses blank and overly long comments', () => {
    expect(() => cleanCommentBody('   ')).toThrow();
    expect(() => cleanCommentBody('x'.repeat(5001))).toThrow();
  });

  it('shortens for alerts', () => {
    expect(commentSnippet('a\n\n b')).toBe('a b');
    expect(commentSnippet('x'.repeat(300)).length).toBe(240);
  });
});

describe('anchors', () => {
  it('none means the whole file', () => {
    expect(cleanAnchor(undefined)).toBeNull();
    expect(cleanAnchor(null)).toBeNull();
  });

  it('drops anything it does not know', () => {
    const anchor = cleanAnchor({ type: 'text', tabId: 't', quote: 'hi', prefix: 'a', suffix: 'b', offset: 3, evil: '<script>' });
    expect(anchor).toEqual({ type: 'text', tabId: 't', quote: 'hi', prefix: 'a', suffix: 'b', offset: 3 });
  });

  it('refuses an empty selection and unknown kinds', () => {
    expect(() => cleanAnchor({ type: 'text', tabId: 't', quote: '  ' })).toThrow();
    expect(() => cleanAnchor({ type: 'mystery' })).toThrow();
    expect(() => cleanAnchor({ type: 'pdf', page: 0, rects: [] })).toThrow();
  });

  it('keeps PDF rectangles on the page and limits how many', () => {
    const anchor = cleanAnchor({ type: 'pdf', page: 1, rects: [{ x: -1, y: 2, w: 0.5, h: 'nope' }] }) as any;
    expect(anchor.rects[0]).toEqual({ x: 0, y: 1, w: 0.5, h: 0 });
    const many = cleanAnchor({ type: 'pdf', page: 0, rects: Array(500).fill({ x: 0, y: 0, w: 1, h: 1 }) }) as any;
    expect(many.rects.length).toBe(60);
  });
});
