import { PDFDocument } from 'pdf-lib';
import { buildDoc, buildFormItems, buildGrid, buildPdf, buildSlides } from './assistant.documents';
import { normalizeItems } from '../forms/forms.logic';

describe('assistant documents', () => {
  it('builds a doc with headings, lists and an evened-out table', () => {
    const { content, preview } = buildDoc([
      { type: 'heading1', text: 'Plan' },
      { type: 'paragraph', text: 'One\n\nTwo' },
      { type: 'bullets', items: ['a', ''] },
      { type: 'table', rows: [['Name', 'Owner'], ['Launch']] },
    ]);
    expect(content.content.map((n: any) => n.type)).toEqual(['heading', 'paragraph', 'paragraph', 'bulletList', 'table']);
    expect(content.content[3].content).toHaveLength(1);
    const [head, body] = content.content[4].content;
    expect(head.content[0].type).toBe('tableHeader');
    expect(body.content).toHaveLength(2);
    expect(preview.lines[0]).toEqual({ t: 'Plan', h: true });
  });

  it('never writes an empty text node, which the editor rejects', () => {
    const { content } = buildDoc([{ type: 'table', rows: [['', 'x']] }]);
    const json = JSON.stringify(content);
    expect(json).not.toContain('"text":""');
  });

  it('refuses an empty doc', () => {
    expect(() => buildDoc([])).toThrow();
    expect(() => buildDoc([{ type: 'paragraph', text: '  ' }])).toThrow();
  });

  it('builds grid cells with numbers, formulas, gaps and a bold header', () => {
    const { content, preview } = buildGrid([{ name: 'Budget', headerRow: true, rows: [['Item', 'Cost'], ['Ads', 100], [null, '=SUM(B2:B2)']] }]);
    const cells: any[] = content.sheets[0].celldata;
    expect(cells).toHaveLength(5);
    expect(cells[0].v.bl).toBe(1);
    expect(cells[3].v).toMatchObject({ v: 100, ct: { t: 'n' } });
    expect(cells[3].v.bl).toBeUndefined();
    expect(cells[4].v.f).toBe('=SUM(B2:B2)');
    expect(cells[4].v.v).toBeUndefined();
    expect(preview.rows[0].slice(0, 2)).toEqual(['Item', 'Cost']);
  });

  it('keeps sheet names unique', () => {
    const { content } = buildGrid([{ name: 'A', rows: [] }, { name: 'A', rows: [] }]);
    expect(new Set(content.sheets.map((s: any) => s.name)).size).toBe(2);
    expect(content.sheets[0].status).toBe(1);
    expect(content.sheets[1].status).toBe(0);
  });

  it('builds slides per layout and falls back to the plain theme', () => {
    const { content, preview } = buildSlides('nope', [
      { layout: 'title', title: 'Hello', subtitle: 'World' },
      { layout: 'content', title: 'Points', bullets: ['a', 'b'] },
      { layout: 'two', title: 'Both', bullets: ['l'], rightBullets: ['r'] },
      { layout: 'section', title: 'Next' },
    ]);
    expect(content.themeId).toBe('plain');
    expect(content.slides.map((s: any) => s.elements.length)).toEqual([2, 2, 3, 1]);
    expect(content.slides[1].elements[1]).toMatchObject({ text: 'a\nb', bullets: true });
    expect(preview.slide.els[0].t).toBe('Hello');
  });

  it('shrinks long bullet lists so they stay on the slide', () => {
    const items = Array.from({ length: 15 }, (_, i) => `Point number ${i}`);
    const { content } = buildSlides('plain', [{ layout: 'content', title: 'Many', bullets: items }]);
    expect(content.slides[0].elements[1].fontSize).toBe(16);
  });

  it('makes a real multi-page PDF and counts characters it cannot show', async () => {
    const long = Array.from({ length: 2000 }, () => 'word').join(' ');
    const { bytes, replaced } = await buildPdf('Report.pdf', [
      { type: 'heading1', text: 'Zürich report' },
      { type: 'paragraph', text: long },
      { type: 'bullets', items: ['one', '日本'] },
      { type: 'table', rows: [['A', 'B'], ['1', 'x'.repeat(300)]] },
    ]);
    expect(replaced).toBe(2);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it('builds form items the forms code accepts', () => {
    const items = buildFormItems([
      { type: 'section', title: 'About you', description: '' },
      { type: 'text', title: 'Note', description: 'Thanks' },
      { type: 'question', kind: 'short_text', title: 'Name', required: true },
      { type: 'question', kind: 'dropdown', title: 'Size', options: ['S', 'S', 'M'] },
    ]);
    const saved = normalizeItems(items, new Map());
    expect(saved).toHaveLength(4);
    expect((saved[3] as any).options).toEqual(['S', 'M']);
  });

  it('refuses a choice question with no options and a form with no questions', () => {
    expect(() => buildFormItems([{ type: 'question', kind: 'dropdown', title: 'Size' }])).toThrow();
    expect(() => buildFormItems([{ type: 'section', title: 'Only' }])).toThrow();
  });
});
