import { ConflictException } from '@nestjs/common';

// A task description holds free text followed by "--- Header ---" blocks: status
// history, forward and return notes, and one "--- Column: X ---" stage marker.
// Browsers save the whole string from the copy they loaded, so a copy that is out
// of date would erase whatever other people added since. The merge below keeps
// those additions, block by block.

const BLOCK_HEADER = /(?:^|\n\n)--- [^\n]*? ---(?=\n|$)/g;
const COLUMN_MARKER = /^--- Column: .+ ---$/;

interface DescriptionParts {
  prose: string;
  history: string[];
  column: string;
}

const parse = (raw: string | null | undefined): DescriptionParts => {
  const text = raw ?? '';
  const starts = Array.from(text.matchAll(BLOCK_HEADER), (match) => match.index as number);
  const parts: DescriptionParts = { prose: text, history: [], column: '' };
  if (starts.length === 0) return parts;

  parts.prose = text.slice(0, starts[0]);
  starts.forEach((start, i) => {
    const block = text.slice(start, starts[i + 1]).replace(/^\n+/, '').trimEnd();
    const lineEnd = block.indexOf('\n');
    const firstLine = lineEnd === -1 ? block : block.slice(0, lineEnd);
    if (COLUMN_MARKER.test(firstLine)) {
      parts.column = firstLine;
      // Text typed after a marker is still the task's own text.
      if (lineEnd !== -1) parts.prose += block.slice(lineEnd);
    } else {
      parts.history.push(block);
    }
  });
  return parts;
};

/** The text people wrote, without history blocks, the stage marker or linked-task ids. */
export const descriptionText = (raw: string | null | undefined): string =>
  parse(raw)
    .prose.replace(/\n?\[\[[A-Z_]+:[^\]]*\]\]/g, '')
    .trim();

const mergeProse = (stored: string, incoming: string, base: string): string => {
  const [s, i, b] = [stored.trimEnd(), incoming.trimEnd(), base.trimEnd()];
  if (i === b) return s; // This save didn't touch the text.
  if (s === b || s === i) return i; // Nobody else did.
  if (b && i.startsWith(b)) return s + i.slice(b.length); // This save only added to the end.
  throw new ConflictException(
    'Someone else changed this description while you were editing. Copy your text, refresh the page and try again.',
  );
};

/**
 * Works out what to store when a browser saves a description.
 *
 * `base` is the copy the browser started from. With it, only that browser's own
 * changes are applied on top of what is stored. Without it (a tab still running
 * an older version of the app) the incoming text wins, but stored history is kept.
 */
export const mergeTaskDescription = (
  stored: string | null | undefined,
  incoming: string,
  base?: string | null,
): string => {
  const hasBase = base !== undefined;
  if (incoming === (stored ?? '') || (hasBase && (base ?? '') === (stored ?? ''))) return incoming;

  const s = parse(stored);
  const i = parse(incoming);
  const incomingHistory = new Set(i.history);
  const storedHistory = new Set(s.history);

  if (!hasBase && s.history.every((block) => incomingHistory.has(block))) return incoming;

  const b = hasBase ? parse(base) : null;
  const removedBySaver = new Set(b ? b.history.filter((block) => !incomingHistory.has(block)) : []);
  const history = [
    ...s.history.filter((block) => !removedBySaver.has(block)),
    ...i.history.filter((block) => !storedHistory.has(block)),
  ];
  const prose = b ? mergeProse(s.prose, i.prose, b.prose) : i.prose.trimEnd();
  const column = b && i.column === b.column ? s.column : i.column;

  return [prose, ...history, ...(column ? [column] : [])].join('\n\n');
};
