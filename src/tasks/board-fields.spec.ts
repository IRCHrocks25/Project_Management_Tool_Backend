import { BadRequestException } from '@nestjs/common';
import { assertDay, normalizeColumnValue } from './board-fields';

const column = (type: any, labels: any[] = []) => ({ name: 'Field', type, labels });

describe('normalizeColumnValue', () => {
  it('treats empty values as clearing the cell', () => {
    expect(normalizeColumnValue(column('text'), '')).toBeNull();
    expect(normalizeColumnValue(column('text'), '   ')).toBeNull();
    expect(normalizeColumnValue(column('people'), [])).toBeNull();
    expect(normalizeColumnValue(column('checkbox'), false)).toBeNull();
  });

  it('accepts numbers typed as text and rejects anything else', () => {
    expect(normalizeColumnValue(column('number'), '12.5')).toBe(12.5);
    expect(() => normalizeColumnValue(column('number'), 'twelve')).toThrow(BadRequestException);
  });

  it('only allows labels the column defines', () => {
    const labelled = column('status', [{ label: 'Paid', color: '#15803d' }]);
    expect(normalizeColumnValue(labelled, 'Paid')).toBe('Paid');
    expect(() => normalizeColumnValue(labelled, 'Unpaid')).toThrow(BadRequestException);
  });

  it('rejects links that could run code when clicked', () => {
    expect(normalizeColumnValue(column('link'), 'https://example.com/a')).toBe('https://example.com/a');
    expect(() => normalizeColumnValue(column('link'), 'javascript:alert(1)')).toThrow(BadRequestException);
    expect(() => normalizeColumnValue(column('link'), 'example.com')).toThrow(BadRequestException);
  });

  it('removes duplicate people and rejects ids that are not ids', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(normalizeColumnValue(column('people'), [id, id])).toEqual([id]);
    expect(() => normalizeColumnValue(column('people'), ['bob'])).toThrow(BadRequestException);
  });
});

describe('assertDay', () => {
  it('accepts a real date only', () => {
    expect(assertDay('2026-11-06', 'Due date')).toBe('2026-11-06');
    expect(() => assertDay('Nov 6', 'Due date')).toThrow(BadRequestException);
    expect(() => assertDay('2026-13-40', 'Due date')).toThrow(BadRequestException);
  });
});
