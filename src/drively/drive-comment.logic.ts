import { BadRequestException } from '@nestjs/common';

export const MAX_COMMENT_LENGTH = 5000;
const MAX_QUOTE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 64;
const MAX_RECTS = 60;

/** A stretch of a Doc, found again by its words so it survives edits around it. */
export interface TextAnchor {
  type: 'text';
  tabId: string;
  quote: string;
  prefix: string;
  suffix: string;
  offset: number;
}

/** A place on a PDF page. Rectangles are fractions of the page, so they hold at any zoom. */
export interface PdfAnchor {
  type: 'pdf';
  page: number;
  quote: string;
  rects: { x: number; y: number; w: number; h: number }[];
}

export type CommentAnchor = TextAnchor | PdfAnchor;

export function cleanCommentBody(raw: unknown): string {
  const body = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  if (!body) throw new BadRequestException('Write something first.');
  if (body.length > MAX_COMMENT_LENGTH) throw new BadRequestException(`Comments can be up to ${MAX_COMMENT_LENGTH} characters.`);
  return body;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const fraction = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

/** Keeps only the known fields of an anchor. It comes from the browser and gets stored, then shown to other people. */
export function cleanAnchor(raw: unknown): CommentAnchor | null {
  if (raw === null || raw === undefined) return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'text') {
    const quote = text(a.quote, MAX_QUOTE_LENGTH);
    if (!quote.trim()) throw new BadRequestException('Select some text to comment on.');
    return {
      type: 'text',
      tabId: text(a.tabId, 100),
      quote,
      prefix: text(a.prefix, MAX_CONTEXT_LENGTH),
      suffix: text(a.suffix, MAX_CONTEXT_LENGTH),
      offset: Math.max(0, Math.floor(Number(a.offset)) || 0),
    };
  }
  if (a.type === 'pdf') {
    const page = Math.floor(Number(a.page));
    if (!Number.isInteger(page) || page < 0 || page > 100000) throw new BadRequestException("That page couldn't be found.");
    if (!Array.isArray(a.rects) || a.rects.length === 0) throw new BadRequestException('Select part of a page to comment on.');
    return {
      type: 'pdf',
      page,
      quote: text(a.quote, MAX_QUOTE_LENGTH),
      rects: a.rects.slice(0, MAX_RECTS).map((r: any) => ({ x: fraction(r?.x), y: fraction(r?.y), w: fraction(r?.w), h: fraction(r?.h) })),
    };
  }
  throw new BadRequestException("That comment's place in the file couldn't be read.");
}

export function commentSnippet(body: string, max = 240): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
