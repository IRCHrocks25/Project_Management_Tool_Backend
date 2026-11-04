import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { stripMentionMarkup } from '../shared/mentions';

export type SearchResultKind = 'product' | 'ticket' | 'sop' | 'update' | 'credential';

export interface SearchResult {
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  productSlug: string;
  tab: string;
  ref: string;
}

const MAX_RESULTS = 20;
const MENTION_MARKUP_RE = `\\[\\[USER_ID:[a-fA-F0-9-]{36}\\]\\]`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function excerpt(text: string, max = 80): string {
  const plain = stripMentionMarkup(text).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(rawQuery: string | undefined): Promise<SearchResult[]> {
    const q = (rawQuery ?? '').trim();
    if (q.length < 2) return [];
    const like = `%${escapeLike(q)}%`;

    // Each source is queried separately so a missing table (e.g. not migrated yet) only drops
    // that kind of result. Only non-archived products; credentials match on label only.
    const sources: { kind: SearchResultKind; run: () => Promise<SearchResult[]> }[] = [
      {
        kind: 'product',
        run: async () => {
          const rows = await this.dataSource.query(
            `SELECT p.slug, p.name, p.code, p.status
               FROM products p
              WHERE p."archivedAt" IS NULL
                AND (p.name ILIKE $1 OR p.code ILIKE $1 OR p.description ILIKE $1)
              ORDER BY p.name ASC
              LIMIT ${MAX_RESULTS}`,
            [like],
          );
          return rows.map((r: any) => ({
            kind: 'product' as const,
            title: r.name,
            subtitle: `${r.code} · ${r.status}`,
            productSlug: r.slug,
            tab: 'overview',
            ref: r.slug,
          }));
        },
      },
      {
        kind: 'ticket',
        run: async () => {
          const rows = await this.dataSource.query(
            `SELECT t.key, t.title, t.status, p.slug, p.name AS "productName"
               FROM product_tickets t
               JOIN products p ON p.id = t."productId"
              WHERE p."archivedAt" IS NULL
                AND (t.key ILIKE $1 OR t.title ILIKE $1)
              ORDER BY t."updatedAt" DESC
              LIMIT ${MAX_RESULTS}`,
            [like],
          );
          return rows.map((r: any) => ({
            kind: 'ticket' as const,
            title: `${r.key} ${r.title}`,
            subtitle: `${r.productName} · ${String(r.status).replace(/_/g, ' ')}`,
            productSlug: r.slug,
            tab: 'tickets',
            ref: r.key,
          }));
        },
      },
      {
        kind: 'sop',
        run: async () => {
          const rows = await this.dataSource.query(
            `SELECT s.id, s.title, s.audience, p.slug, p.name AS "productName"
               FROM product_sops s
               JOIN products p ON p.id = s."productId"
              WHERE p."archivedAt" IS NULL
                AND (s.title ILIKE $1 OR s.audience ILIKE $1)
              ORDER BY s."updatedAt" DESC
              LIMIT ${MAX_RESULTS}`,
            [like],
          );
          return rows.map((r: any) => ({
            kind: 'sop' as const,
            title: r.title,
            subtitle: r.audience ? `${r.productName} · for ${r.audience}` : `${r.productName} · SOP`,
            productSlug: r.slug,
            tab: 'sops',
            ref: r.id,
          }));
        },
      },
      {
        kind: 'update',
        run: async () => {
          const rows = await this.dataSource.query(
            `SELECT u.id, u.body, u.type, p.slug, p.name AS "productName"
               FROM product_updates u
               JOIN products p ON p.id = u."productId"
              WHERE p."archivedAt" IS NULL
                AND regexp_replace(u.body, $2, '', 'g') ILIKE $1
              ORDER BY u."createdAt" DESC
              LIMIT ${MAX_RESULTS}`,
            [like, MENTION_MARKUP_RE],
          );
          return rows.map((r: any) => ({
            kind: 'update' as const,
            title: excerpt(r.body ?? ''),
            subtitle: `${r.productName} · ${String(r.type ?? 'update').replace(/_/g, ' ')}`,
            productSlug: r.slug,
            tab: 'updates',
            ref: r.id,
          }));
        },
      },
      {
        kind: 'credential',
        run: async () => {
          // Label only — never select, search or return usernames or secrets.
          const rows = await this.dataSource.query(
            `SELECT c.id, c.label, c.environment, p.slug, p.name AS "productName"
               FROM product_credentials c
               JOIN products p ON p.id = c."productId"
              WHERE p."archivedAt" IS NULL
                AND c.label ILIKE $1
              ORDER BY c.label ASC
              LIMIT ${MAX_RESULTS}`,
            [like],
          );
          return rows.map((r: any) => ({
            kind: 'credential' as const,
            title: r.label,
            subtitle: `${r.productName} · ${r.environment}`,
            productSlug: r.slug,
            tab: 'vault',
            ref: r.id,
          }));
        },
      },
    ];

    const results: SearchResult[] = [];
    for (const source of sources) {
      if (results.length >= MAX_RESULTS) break;
      try {
        const rows = await source.run();
        results.push(...rows.slice(0, MAX_RESULTS - results.length));
      } catch (err: any) {
        // 42P01 undefined_table / 42703 undefined_column: that part of the Hub isn't migrated yet.
        if (err?.code !== '42P01' && err?.code !== '42703') {
          this.logger.warn(`Search over ${source.kind} failed: ${err?.message}`);
        }
      }
    }
    return results;
  }
}
