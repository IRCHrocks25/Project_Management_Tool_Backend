import { BadRequestException } from '@nestjs/common';
import { PageAccessLevel, PageShareRule, WorkspaceActor, pageAccessLevel } from '../workspace/workspace-access';

export const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
export const MAX_NAME_LENGTH = 255;

export const DEFAULT_NAMES: Record<string, string> = {
  folder: 'Untitled folder',
  doc: 'Untitled document',
  grid: 'Untitled grid',
  slides: 'Untitled presentation',
  pdf: 'Untitled PDF',
  file: 'Untitled file',
};

export type DriveAccess = PageAccessLevel;

export interface ChainLink {
  ownerId: string | null;
  shares: PageShareRule[];
}

/**
 * What a person can do with an item, given the item first and then its parent folders. Files are private
 * by default and nobody gets an admin override, the same as Pages: Drive holds personal things and logins.
 * Sharing a folder shares what's inside it. Owning a folder lets you edit what's inside but only the item's
 * own owner can share or delete it for good.
 */
export function driveAccessLevel(actor: WorkspaceActor, chain: ChainLink[]): DriveAccess | null {
  if (!actor.userId || chain.length === 0) return null;
  if (chain[0].ownerId === actor.userId) return 'owner';
  let best: DriveAccess | null = null;
  for (const link of chain) {
    const level = pageAccessLevel(actor, link, link.shares);
    if (level === 'owner' || level === 'edit') return 'edit';
    if (level === 'view') best = 'view';
  }
  return best;
}

export const canEdit = (level: DriveAccess | null) => level === 'owner' || level === 'edit';

/** Names can't be blank or carry control characters; slashes are fine because names aren't paths. */
export function cleanName(raw: string | undefined | null, fallback: string): string {
  const name = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (name || fallback).slice(0, MAX_NAME_LENGTH);
}

export function assertContentSize(content: unknown): void {
  if (content !== undefined && Buffer.byteLength(JSON.stringify(content)) > MAX_CONTENT_BYTES) {
    throw new BadRequestException('This file is too large to save. The limit is 10 MB of content.');
  }
}

export function normalizeShares(shares: { kind: string; target?: string | null; permission: string }[]): PageShareRule[] {
  const seen = new Map<string, PageShareRule>();
  for (const s of shares) {
    if (s.kind !== 'everyone' && !s.target) throw new BadRequestException('Pick who to share with.');
    const target = s.kind === 'everyone' ? null : (s.target as string);
    seen.set(`${s.kind}:${target ?? ''}`, { kind: s.kind, target, permission: s.permission });
  }
  return [...seen.values()];
}

/** Sets `src` on every picture from `links`; a picture with no link loses its `src`. */
export function withAssetLinks<T>(content: T, links: Map<string, string>): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) out[key] = walk(value);
      if (typeof out.assetId === 'string' && out.assetId) out.src = links.get(out.assetId) ?? null;
      return out;
    }
    return node;
  };
  return walk(content) as T;
}

/** Expiring links must not be written back, or they'd be stored and could outlive the person's access. */
export function withoutAssetLinks<T>(content: T): T {
  return withAssetLinks(content, new Map());
}

export function pdfOrFile(contentType: string | undefined, name: string): 'pdf' | 'file' {
  return contentType === 'application/pdf' || /\.pdf$/i.test(name) ? 'pdf' : 'file';
}

/**
 * What a Doc, Grid or Slides asset holds in Iceberg. `content` is plain JSON from a new file or an import;
 * `yjs` is the live editing state once someone has opened it, and it replaces `content`.
 */
export interface StoredFile {
  content: unknown;
  yjs: Uint8Array | null;
}

export function encodeStored(file: { content?: unknown; yjs?: Uint8Array | null }): Buffer {
  if (file.yjs) return Buffer.from(JSON.stringify({ yjs: Buffer.from(file.yjs).toString('base64') }));
  return Buffer.from(JSON.stringify({ content: withoutAssetLinks(file.content ?? {}) }));
}

export function decodeStored(text: string): StoredFile {
  const parsed = JSON.parse(text);
  return {
    content: parsed.content ?? null,
    yjs: typeof parsed.yjs === 'string' ? new Uint8Array(Buffer.from(parsed.yjs, 'base64')) : null,
  };
}
