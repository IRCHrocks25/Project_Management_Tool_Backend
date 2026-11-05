import { BadRequestException } from '@nestjs/common';
import { BoardColumn } from './entities/board-column.entity';

export const TASK_PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 2000;

export const assertDay = (value: unknown, label: string): string => {
  if (typeof value === 'string' && DAY_RE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    return value;
  }
  throw new BadRequestException(`${label} must be a date like 2026-11-06`);
};

const safeLink = (value: unknown): string => {
  const raw = typeof value === 'string' ? value.trim() : '';
  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || raw.length > MAX_TEXT) {
    throw new BadRequestException('A link must start with http:// or https://');
  }
  return raw;
};

/** Checks a value against its column. Returns null when the value clears the cell. */
export const normalizeColumnValue = (column: Pick<BoardColumn, 'name' | 'type' | 'labels'>, value: unknown): unknown => {
  if (value === null || value === undefined || value === '') return null;
  switch (column.type) {
    case 'text': {
      if (typeof value !== 'string') throw new BadRequestException(`${column.name} must be text`);
      const text = value.trim();
      if (text.length > MAX_TEXT) throw new BadRequestException(`${column.name} is too long`);
      return text || null;
    }
    case 'number': {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) throw new BadRequestException(`${column.name} must be a number`);
      return number;
    }
    case 'status':
      if (!(column.labels || []).some((option) => option.label === value)) {
        throw new BadRequestException(`${column.name} has no label called "${String(value)}"`);
      }
      return value;
    case 'date':
      return assertDay(value, column.name);
    case 'people': {
      if (!Array.isArray(value) || value.length > 50 || value.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
        throw new BadRequestException(`${column.name} must be a list of people`);
      }
      return value.length > 0 ? Array.from(new Set(value)) : null;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new BadRequestException(`${column.name} must be checked or unchecked`);
      return value || null;
    case 'link':
      return safeLink(value);
    default:
      throw new BadRequestException(`${column.name} has an unknown column type`);
  }
};
