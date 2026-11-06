/**
 * Turns the simple outlines the assistant writes into real Drively and Forms content. The shapes match what the
 * editors load: TipTap JSON for Docs, FortuneSheet cells for Grid, and elements for Slides, whose layouts and
 * themes mirror driveContent.ts in the frontend.
 */
import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { CHOICE_KINDS, FormItem, QUESTION_KINDS, QuestionKind } from '../forms/forms.types';

const MAX_BLOCKS = 1000;
const MAX_SHEETS = 20;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const MAX_SLIDES = 60;
const MAX_FORM_ITEMS = 200;

const newId = () => randomBytes(6).toString('hex');
// eslint-disable-next-line no-control-regex
const clean = (value: unknown) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/* ------------------------------ Docs ------------------------------ */

export interface DocBlock {
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'bullets' | 'numbered' | 'table';
  text?: string;
  items?: string[];
  rows?: string[][];
}

const textNodes = (text: string) => {
  const line = text.replace(/\s*\n\s*/g, ' ');
  return line ? [{ type: 'text', text: line }] : [];
};
const paragraph = (text: string) => {
  const content = textNodes(text);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};

const blocksOf = (raw: unknown): DocBlock[] => {
  const blocks = list(raw);
  if (!blocks.length) throw new BadRequestException('There is no content to put in the file.');
  if (blocks.length > MAX_BLOCKS) throw new BadRequestException(`That is too long. The limit is ${MAX_BLOCKS} blocks.`);
  return blocks;
};

/** Every row gets the same number of cells, because the editor's tables need that. */
const tableRows = (block: DocBlock) => {
  const rows = list(block.rows).map((r) => list(r).map(clean));
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.filter((r) => r.length).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
};

export function buildDoc(rawBlocks: unknown) {
  const content: any[] = [];
  const lines: { t: string; h?: boolean }[] = [];
  const note = (t: string, h?: boolean) => {
    if (t && lines.length < 12) lines.push({ t: t.slice(0, 140), ...(h ? { h } : {}) });
  };
  for (const block of blocksOf(rawBlocks)) {
    const text = clean(block.text);
    const heading = /^heading([123])$/.exec(block.type)?.[1];
    if (heading) {
      if (!text) continue;
      content.push({ type: 'heading', attrs: { level: Number(heading) }, content: textNodes(text) });
      note(text, true);
    } else if (block.type === 'bullets' || block.type === 'numbered') {
      const items = list(block.items).map(clean).filter(Boolean);
      if (!items.length) continue;
      content.push({
        type: block.type === 'bullets' ? 'bulletList' : 'orderedList',
        content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
      });
      items.forEach((item) => note(item));
    } else if (block.type === 'table') {
      const rows = tableRows(block);
      if (!rows.length) continue;
      content.push({
        type: 'table',
        content: rows.map((row, r) => ({
          type: 'tableRow',
          content: row.map((cell) => ({ type: r === 0 ? 'tableHeader' : 'tableCell', content: [paragraph(cell)] })),
        })),
      });
      rows.forEach((row) => note(row.join('  ')));
    } else {
      text.split(/\n\s*\n/).forEach((part) => {
        const t = part.trim();
        if (t) {
          content.push(paragraph(t));
          note(t);
        }
      });
    }
  }
  if (!content.length) throw new BadRequestException('There is no content to put in the file.');
  return { content: { type: 'doc', content }, preview: { lines } };
}

/* ------------------------------ Grid ------------------------------ */

export function buildGrid(rawSheets: unknown) {
  const input = list(rawSheets);
  if (!input.length) throw new BadRequestException('There is nothing to put in the spreadsheet.');
  if (input.length > MAX_SHEETS) throw new BadRequestException(`That is too many sheets. The limit is ${MAX_SHEETS}.`);
  const used = new Set<string>();
  const sheets = input.map((sheet: any, index: number) => {
    const rows = list(sheet?.rows);
    if (rows.length > MAX_ROWS) throw new BadRequestException(`That is too many rows. The limit is ${MAX_ROWS}.`);
    let name = (clean(sheet?.name) || `Sheet${index + 1}`).slice(0, 31);
    if (used.has(name)) name = `${name.slice(0, 27)} (${index + 1})`;
    used.add(name);
    const celldata: any[] = [];
    const widest: number[] = [];
    let columns = 0;
    rows.forEach((row: unknown, r: number) => {
      const cells = list(row);
      if (cells.length > MAX_COLUMNS) throw new BadRequestException(`That is too many columns. The limit is ${MAX_COLUMNS}.`);
      columns = Math.max(columns, cells.length);
      cells.forEach((raw: unknown, c: number) => {
        if (raw === null || raw === undefined || raw === '') return;
        const header = sheet?.headerRow && r === 0 ? { bl: 1, bg: '#f3f4f6' } : {};
        if (typeof raw === 'string' && raw.startsWith('=') && raw.length > 1) {
          // No value yet: the editor works it out when the file opens.
          celldata.push({ r, c, v: { f: raw, ct: { fa: 'General', t: 'n' }, ...header } });
          widest[c] = Math.max(widest[c] || 0, 10);
          return;
        }
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : clean(raw);
        const shown = String(value);
        celldata.push({ r, c, v: { v: value, m: shown, ct: { fa: 'General', t: typeof value === 'number' ? 'n' : 's' }, ...header } });
        widest[c] = Math.max(widest[c] || 0, shown.length);
      });
    });
    const columnlen: Record<number, number> = {};
    widest.forEach((chars, c) => {
      if (chars > 10) columnlen[c] = Math.min(chars * 7 + 16, 320);
    });
    return {
      name,
      id: newId(),
      status: index === 0 ? 1 : 0,
      order: index,
      celldata,
      row: Math.max(100, rows.length + 20),
      column: Math.max(26, columns),
      ...(Object.keys(columnlen).length ? { config: { columnlen } } : {}),
    };
  });
  const sample: string[][] = [];
  for (const { r, c, v } of sheets[0].celldata) {
    if (r < 12 && c < 7) (sample[r] = sample[r] || [])[c] = String(v.m ?? v.f ?? '').slice(0, 24);
  }
  const previewRows = Array.from({ length: Math.max(sample.length, 1) }, (_, r) => Array.from({ length: 7 }, (_u, c) => sample[r]?.[c] || ''));
  return { content: { sheets }, preview: { rows: previewRows } };
}

/* ------------------------------ Slides ------------------------------ */

const THEMES: Record<string, { background: string; title: string; body: string; font: string }> = {
  plain: { background: '#ffffff', title: '#111111', body: '#374151', font: 'Arial' },
  teal: { background: '#0f766e', title: '#ffffff', body: '#e6fffb', font: 'Arial' },
  night: { background: '#111827', title: '#f9fafb', body: '#d1d5db', font: 'Arial' },
  paper: { background: '#ffffff', title: '#7c2d12', body: '#44403c', font: 'Georgia' },
  forest: { background: '#14532d', title: '#f0fdf4', body: '#dcfce7', font: 'Verdana' },
};
export const SLIDE_THEME_IDS = Object.keys(THEMES);
export const SLIDE_LAYOUT_IDS = ['title', 'content', 'section', 'two'];

/** Long lists get smaller text so they stay on the slide. */
const bulletSize = (items: string[], width: number) => {
  const lines = items.reduce((sum, item) => sum + Math.max(1, Math.ceil((item.length * 12) / width)), 0);
  return lines > 12 ? 16 : lines > 9 ? 20 : 24;
};

export function buildSlides(themeId: unknown, rawSlides: unknown) {
  const id = typeof themeId === 'string' && THEMES[themeId] ? themeId : 'plain';
  const theme = THEMES[id];
  const input = list(rawSlides);
  if (!input.length) throw new BadRequestException('There are no slides to create.');
  if (input.length > MAX_SLIDES) throw new BadRequestException(`That is too many slides. The limit is ${MAX_SLIDES}.`);
  const box = (over: Record<string, unknown>) => ({
    id: newId(),
    type: 'text',
    x: 60,
    y: 40,
    w: 840,
    h: 100,
    text: '',
    fontFamily: theme.font,
    fontSize: 24,
    color: theme.body,
    align: 'left',
    valign: 'top',
    ...over,
  });
  const title = (text: string, over: Record<string, unknown> = {}) =>
    box({ text, fontSize: 36, bold: true, color: theme.title, placeholder: 'Click to add title', valign: 'middle', ...over });
  const bullets = (items: string[], over: Record<string, unknown>) =>
    box({
      text: items.join('\n'),
      bullets: true,
      placeholder: 'Click to add text',
      y: 140,
      h: 350,
      fontSize: bulletSize(items, Number(over.w ?? 840)),
      ...over,
    });
  const slides = input.map((slide: any) => {
    const head = clean(slide?.title);
    const left = list(slide?.bullets).map(clean).filter(Boolean);
    const right = list(slide?.rightBullets).map(clean).filter(Boolean);
    let elements: any[];
    if (slide?.layout === 'title') {
      elements = [
        title(head, { y: 170, h: 120, fontSize: 48, align: 'center' }),
        box({ text: clean(slide?.subtitle), y: 300, h: 70, align: 'center', placeholder: 'Click to add subtitle', valign: 'middle' }),
      ];
    } else if (slide?.layout === 'section') {
      elements = [title(head, { y: 200, h: 140, fontSize: 44, align: 'center' })];
    } else if (slide?.layout === 'two') {
      elements = [title(head, { h: 90 }), bullets(left, { w: 400 }), bullets(right, { x: 500, w: 400 })];
    } else {
      elements = [title(head, { h: 90 }), bullets(left, {})];
    }
    return { id: newId(), ...(clean(slide?.notes) ? { notes: clean(slide.notes) } : {}), elements };
  });
  const preview = {
    slide: {
      bg: theme.background,
      els: slides[0].elements.map((e: any) => ({ x: e.x, y: e.y, w: e.w, h: e.h, t: e.text.slice(0, 80) || undefined, c: e.color, s: e.fontSize })),
    },
  };
  return { content: { themeId: id, slides }, preview };
}

/* ------------------------------ PDF ------------------------------ */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const INK = rgb(0.13, 0.13, 0.13);
const RULE = rgb(0.8, 0.8, 0.8);
const HEADER_FILL = rgb(0.95, 0.96, 0.96);

/** The built-in PDF fonts cover Western languages only. Anything else becomes "?" and is counted. */
export async function buildPdf(name: string, rawBlocks: unknown): Promise<{ bytes: Buffer; replaced: number }> {
  const blocks = blocksOf(rawBlocks);
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  let replaced = 0;
  const safe = (text: unknown) =>
    Array.from(clean(text).replace(/\t/g, '    ').replace(/\s*\n\s*/g, ' '))
      .map((ch) => {
        if (supported.has(ch.codePointAt(0) as number)) return ch;
        replaced += 1;
        return '?';
      })
      .join('');

  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      let piece = word;
      const joined = line ? `${line} ${piece}` : piece;
      if (font.widthOfTextAtSize(joined, size) <= width) {
        line = joined;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the line, like a long link, is cut to fit.
      while (font.widthOfTextAtSize(piece, size) > width && piece.length > 1) {
        let cut = piece.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut -= 1;
        out.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }
      line = piece;
    }
    if (line) out.push(line);
    return out;
  };

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const room = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };
  const write = (text: string, font: PDFFont, size: number, x = MARGIN, width = PAGE_W - MARGIN - x) => {
    const leading = size * 1.42;
    for (const line of wrap(text, font, size, width)) {
      room(leading);
      page.drawText(line, { x, y: y - size, size, font, color: INK });
      y -= leading;
    }
  };

  const HEADINGS: Record<string, { size: number; before: number }> = {
    heading1: { size: 22, before: 14 },
    heading2: { size: 16, before: 12 },
    heading3: { size: 12.5, before: 8 },
  };

  for (const block of blocks) {
    const heading = HEADINGS[block.type];
    if (heading) {
      const text = safe(block.text);
      if (!text) continue;
      // A heading shouldn't sit alone at the bottom of a page.
      room(heading.before + heading.size * 1.42 + 34);
      y -= page.getSize().height - MARGIN === y ? 0 : heading.before;
      write(text, bold, heading.size);
      y -= 4;
    } else if (block.type === 'bullets' || block.type === 'numbered') {
      list(block.items).forEach((item, i) => {
        const text = safe(item);
        if (!text) return;
        room(16);
        page.drawText(block.type === 'bullets' ? '•' : `${i + 1}.`, { x: MARGIN + 6, y: y - 11, size: 11, font: regular, color: INK });
        write(text, regular, 11, MARGIN + 24);
        y -= 3;
      });
      y -= 6;
    } else if (block.type === 'table') {
      const rows = tableRows(block).map((row) => row.map(safe));
      if (!rows.length) continue;
      const width = (PAGE_W - MARGIN * 2) / rows[0].length;
      rows.forEach((row, r) => {
        const font = r === 0 ? bold : regular;
        const wrapped = row.map((cell) => wrap(cell, font, 10, width - 12));
        const height = Math.max(1, ...wrapped.map((c) => c.length)) * 14 + 10;
        room(height);
        row.forEach((_, c) => {
          const x = MARGIN + c * width;
          page.drawRectangle({ x, y: y - height, width, height, borderColor: RULE, borderWidth: 0.6, ...(r === 0 ? { color: HEADER_FILL } : {}) });
          wrapped[c].forEach((line, l) => page.drawText(line, { x: x + 6, y: y - 16 - l * 14, size: 10, font, color: INK }));
        });
        y -= height;
      });
      y -= 12;
    } else {
      const text = safe(block.text);
      if (!text) continue;
      write(text, regular, 11);
      y -= 8;
    }
  }

  const pages = pdf.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      p.drawText(label, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 9), y: 30, size: 9, font: regular, color: rgb(0.45, 0.45, 0.45) });
    });
  }
  return { bytes: Buffer.from(await pdf.save()), replaced };
}

/* ------------------------------ Forms ------------------------------ */

export function buildFormItems(raw: unknown): FormItem[] {
  const input = list(raw);
  if (!input.length) throw new BadRequestException('A form needs at least one question.');
  if (input.length > MAX_FORM_ITEMS) throw new BadRequestException(`That is too long. The limit is ${MAX_FORM_ITEMS} items.`);
  const items = input.map((item: any): FormItem => {
    const title = clean(item?.title);
    const description = clean(item?.description);
    if (item?.type === 'section') return { id: `s-${newId()}`, type: 'section', title, description };
    if (item?.type === 'text') return { id: `t-${newId()}`, type: 'text', title, body: description };
    const kind: QuestionKind = QUESTION_KINDS.includes(item?.kind) ? item.kind : 'short_text';
    const options = CHOICE_KINDS.includes(kind) ? [...new Set(list(item?.options).map(clean).filter(Boolean))] : [];
    if (CHOICE_KINDS.includes(kind) && options.length === 0) {
      throw new BadRequestException(`The question "${title}" needs options to choose from.`);
    }
    return { id: `q-${newId()}`, type: 'question', kind, title: title || 'Untitled question', description, required: !!item?.required, options, allowOther: false };
  });
  if (!items.some((i) => i.type === 'question')) throw new BadRequestException('A form needs at least one question.');
  return items;
}
