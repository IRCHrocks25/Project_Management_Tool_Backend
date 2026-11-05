/** Pure helpers for TipTap JSON documents. Walks use an explicit stack, so a hostile document can't overflow it. */

export interface TaskItemInfo {
  index: number;
  text: string;
  checked: boolean;
}

export const EXCERPT_LENGTH = 200;
export const MAX_DOC_BYTES = 1024 * 1024;
const MAX_DOC_DEPTH = 200;

const childrenOf = (node: any): any[] => (Array.isArray(node?.content) ? node.content : []);

/** Every node in document order, parents before children. */
function* walk(root: any): Generator<any> {
  const stack: any[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    yield node;
    const children = childrenOf(node);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}

/** Why a document can't be saved, or null when it's fine. */
export function docProblem(doc: any): string | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.type !== 'doc') {
    return "That page content isn't a valid document.";
  }
  const stack: { node: any; depth: number }[] = [{ node: doc, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    if (depth > MAX_DOC_DEPTH) return 'This page is nested too deeply to save.';
    if (node?.content !== undefined && !Array.isArray(node.content)) return "That page content isn't a valid document.";
    for (const child of childrenOf(node)) {
      if (child && typeof child === 'object') stack.push({ node: child, depth: depth + 1 });
    }
  }
  const json = JSON.stringify(doc);
  if (Buffer.byteLength(json, 'utf8') > MAX_DOC_BYTES) return 'This page is too big. The limit is 1 MB.';
  // Postgres can't store NUL in jsonb. It only appears escaped once stringified.
  if (/(^|[^\\])(\\\\)*\\u0000/.test(json)) return "That page content isn't a valid document.";
  return null;
}

/** Plain text for search: one line per block. */
export function extractText(doc: any): string {
  const parts: string[] = [];
  const stack: any[] = [doc];
  const BLOCK_END = Symbol('block end');
  while (stack.length) {
    const node = stack.pop();
    if (node === BLOCK_END) {
      parts.push('\n');
      continue;
    }
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'text') {
      if (typeof node.text === 'string') parts.push(node.text);
      continue;
    }
    if (node.type === 'hardBreak') {
      parts.push('\n');
      continue;
    }
    const children = childrenOf(node);
    if (children.length) stack.push(BLOCK_END);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** A one-line preview cut on a word where possible. */
export function excerptOf(text: string, max = EXCERPT_LENGTH): string {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The concatenated text of a node's descendants, with no separators. */
function descendantText(node: any): string {
  let text = '';
  for (const n of walk(node)) {
    if (n.type === 'text' && typeof n.text === 'string') text += n.text;
  }
  return text;
}

/** Every taskItem in depth-first order. `index` is what the checklist route takes. */
export function listTaskItems(doc: any): TaskItemInfo[] {
  const items: TaskItemInfo[] = [];
  for (const node of walk(doc)) {
    if (node.type === 'taskItem') {
      items.push({ index: items.length, text: descendantText(node), checked: !!node.attrs?.checked });
    }
  }
  return items;
}

export function checklistCounts(doc: any): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const node of walk(doc)) {
    if (node.type === 'taskItem') {
      total++;
      if (node.attrs?.checked) done++;
    }
  }
  return { done, total };
}

/**
 * A copy of the document with the taskItem at `index` set to `checked`, leaving the input alone.
 * Null if there's no such item or its text isn't `expectedText`, which means the document moved on.
 */
export function setTaskItemChecked(doc: any, index: number, expectedText: string, checked: boolean): any | null {
  const copy = structuredClone(doc);
  let position = 0;
  for (const node of walk(copy)) {
    if (node.type !== 'taskItem') continue;
    if (position === index) {
      if (descendantText(node) !== expectedText) return null;
      node.attrs = { ...(node.attrs || {}), checked };
      return copy;
    }
    position++;
  }
  return null;
}

/** An empty document that the editor accepts. */
export const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });
