import {
  MAX_DOC_BYTES,
  checklistCounts,
  docProblem,
  emptyDoc,
  excerptOf,
  extractText,
  listTaskItems,
  setTaskItemChecked,
} from './tiptap';

const t = (text: string) => ({ type: 'text', text });
const p = (...texts: string[]) => ({ type: 'paragraph', content: texts.map(t) });
const task = (checked: boolean, ...content: any[]) => ({ type: 'taskItem', attrs: { checked }, content });
const taskList = (...items: any[]) => ({ type: 'taskList', content: items });

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [t('Launch   plan')] },
    p('First ', 'line'),
    taskList(task(true, p('one')), task(false, p('two'), taskList(task(false, p('nested')))), task(false, p('three'))),
    { type: 'paragraph', content: [t('a'), { type: 'hardBreak' }, t('b')] },
  ],
};

describe('extractText', () => {
  it('puts blocks on their own lines and tidies whitespace', () => {
    expect(extractText(doc)).toBe('Launch plan\nFirst line\none\ntwo\nnested\nthree\na\nb');
  });

  it('handles empty and odd documents', () => {
    expect(extractText(emptyDoc())).toBe('');
    expect(extractText({ type: 'doc' })).toBe('');
    expect(extractText({ type: 'doc', content: [null, 3, { type: 'text' }] })).toBe('');
  });
});

describe('excerptOf', () => {
  it('flattens to one line', () => {
    expect(excerptOf('a\nb   c')).toBe('a b c');
  });

  it('cuts long text on a word', () => {
    const out = excerptOf(`${'word '.repeat(100)}end`, 50);
    expect(out.endsWith('word…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });

  it('cuts text without spaces', () => {
    expect(excerptOf('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});

describe('taskItems', () => {
  it('lists depth-first with parents before their nested items', () => {
    expect(listTaskItems(doc)).toEqual([
      { index: 0, text: 'one', checked: true },
      { index: 1, text: 'twonested', checked: false },
      { index: 2, text: 'nested', checked: false },
      { index: 3, text: 'three', checked: false },
    ]);
  });

  it('counts done and total', () => {
    expect(checklistCounts(doc)).toEqual({ done: 1, total: 4 });
    expect(checklistCounts(emptyDoc())).toEqual({ done: 0, total: 0 });
  });

  it('treats a missing attrs as unchecked', () => {
    expect(listTaskItems({ type: 'doc', content: [{ type: 'taskItem', content: [p('x')] }] })[0].checked).toBe(false);
  });
});

describe('setTaskItemChecked', () => {
  it('sets the item at the index without touching the input', () => {
    const before = JSON.stringify(doc);
    const next = setTaskItemChecked(doc, 2, 'nested', true);
    expect(JSON.stringify(doc)).toBe(before);
    expect(listTaskItems(next).map((i) => i.checked)).toEqual([true, false, true, false]);
  });

  it('can uncheck, and keeps other attrs', () => {
    const next = setTaskItemChecked(doc, 0, 'one', false);
    expect(listTaskItems(next)[0].checked).toBe(false);
    const withAttrs = { type: 'doc', content: [{ type: 'taskItem', attrs: { checked: false, id: 'k' }, content: [p('x')] }] };
    expect(setTaskItemChecked(withAttrs, 0, 'x', true).content[0].attrs).toEqual({ checked: true, id: 'k' });
  });

  it('returns null if the index does not exist or the text moved on', () => {
    expect(setTaskItemChecked(doc, 9, 'one', true)).toBeNull();
    expect(setTaskItemChecked(doc, -1, 'one', true)).toBeNull();
    expect(setTaskItemChecked(doc, 1, 'two', true)).toBeNull();
    expect(setTaskItemChecked(doc, 0, 'three', true)).toBeNull();
  });
});

describe('docProblem', () => {
  it('accepts a normal document', () => {
    expect(docProblem(doc)).toBeNull();
    expect(docProblem(emptyDoc())).toBeNull();
  });

  it('rejects anything that is not type doc', () => {
    for (const bad of [null, 'doc', [], {}, { type: 'paragraph' }]) expect(docProblem(bad)).toMatch(/valid document/);
    expect(docProblem({ type: 'doc', content: 'nope' })).toMatch(/valid document/);
  });

  it('rejects documents over 1 MB', () => {
    const big = { type: 'doc', content: [p('x'.repeat(MAX_DOC_BYTES))] };
    expect(docProblem(big)).toMatch(/1 MB/);
  });

  it('counts bytes, not characters', () => {
    const big = { type: 'doc', content: [p('é'.repeat(MAX_DOC_BYTES / 2 + 10))] };
    expect(docProblem(big)).toMatch(/1 MB/);
  });

  it('rejects deep nesting without overflowing the stack', () => {
    let node: any = { type: 'paragraph' };
    for (let i = 0; i < 50000; i++) node = { type: 'x', content: [node] };
    expect(docProblem({ type: 'doc', content: [node] })).toMatch(/nested/);
  });

  it('rejects a NUL character, which Postgres cannot store, but not an escaped backslash-u', () => {
    expect(docProblem({ type: 'doc', content: [p('a\u0000b')] })).toMatch(/valid document/);
    expect(docProblem({ type: 'doc', content: [p('literal \\u0000 text')] })).toBeNull();
  });
});
