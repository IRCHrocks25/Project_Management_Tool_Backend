import 'multer';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HubUsersService } from '../products/hub-users.service';
import { IcebergService, IcebergUploadResult } from '../shared/iceberg.service';
import { WorkspaceActor } from '../workspace/workspace-access';
import { CreateDriveItemDto, SetDriveSharesDto, UpdateDriveItemDto } from './dto/drively.dto';
import {
  ChainLink,
  DEFAULT_NAMES,
  DriveAccess,
  MAX_CONTENT_BYTES,
  StoredFile,
  assertContentSize,
  canEdit,
  cleanName,
  decodeStored,
  encodeStored,
  driveAccessLevel,
  normalizeShares,
  pdfOrFile,
} from './drively.logic';

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_RESULTS = 200;
const EDITABLE_KINDS = ['doc', 'grid', 'slides'];
const NOT_FOUND = 'File not found.';
const STALE = 'Someone else changed this file. Reload to get the latest version.';

export type DriveView = 'mine' | 'shared' | 'recent' | 'starred' | 'trash' | 'search';

const COLUMNS = `i.id, i.kind, i.name, i."parentId", i."ownerId", i.preview, i.revision, i."contentType",
  i."sizeBytes", i."trashedAt", i."trashRootId", i."updatedById", i."createdAt", i."updatedAt"`;

const RETURNED = COLUMNS.replace(/i\./g, '');

// Everything a person can reach: what they own, what's shared with them, and whatever sits inside those.
const ACCESSIBLE_CTE = `WITH RECURSIVE accessible AS (
    SELECT i.id FROM drive_items i
    WHERE i."ownerId" = $1::uuid
       OR EXISTS (
         SELECT 1 FROM drive_item_shares s WHERE s."itemId" = i.id
           AND (s.kind = 'everyone' OR (s.kind = 'user' AND s.target = ($1::uuid)::text) OR (s.kind = 'department' AND s.target = $2::text))
       )
    UNION
    SELECT c.id FROM drive_items c JOIN accessible a ON c."parentId" = a.id
  )`;

@Injectable()
export class DrivelyService {
  private readonly logger = new Logger(DrivelyService.name);

  /** Set by the gateway: sends unsaved live edits to Iceberg. */
  flushLive: (id: string) => Promise<void> = async () => undefined;
  /** Set by the gateway: re-checks everyone editing live after sharing or trash changes. */
  onAccessChanged: () => void = () => undefined;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly iceberg: IcebergService,
    private readonly hubUsers: HubUsersService,
  ) {}

  /* ---------------------------- access ---------------------------- */

  /** The item followed by its parent folders, each with its share rules. */
  private async chain(id: string): Promise<(ChainLink & { id: string; name: string; kind: string; trashedAt: Date | null })[]> {
    const rows = await this.db.query(
      `WITH RECURSIVE up AS (
         SELECT id, name, kind, "ownerId", "parentId", "trashedAt", 0 AS depth FROM drive_items WHERE id = $1
         UNION ALL
         SELECT p.id, p.name, p.kind, p."ownerId", p."parentId", p."trashedAt", up.depth + 1
         FROM drive_items p JOIN up ON p.id = up."parentId" WHERE up.depth < 100
       )
       SELECT up.id, up.name, up.kind, up."ownerId", up."trashedAt", up.depth,
         COALESCE((SELECT json_agg(json_build_object('kind', s.kind, 'target', s.target, 'permission', s.permission))
                   FROM drive_item_shares s WHERE s."itemId" = up.id), '[]') AS shares
       FROM up ORDER BY up.depth`,
      [id],
    );
    return rows;
  }

  /** Anyone without access gets 404, so a file's existence isn't leaked. */
  private async access(id: string, actor: WorkspaceActor) {
    const chain = await this.chain(id);
    const level = driveAccessLevel(actor, chain);
    if (!level) throw new NotFoundException(NOT_FOUND);
    return { chain, level, item: chain[0] };
  }

  private async requireLive(id: string, actor: WorkspaceActor) {
    const found = await this.access(id, actor);
    if (found.item.trashedAt) throw new NotFoundException(NOT_FOUND);
    return found;
  }

  private async requireEdit(id: string, actor: WorkspaceActor) {
    const found = await this.requireLive(id, actor);
    if (!canEdit(found.level)) throw new ForbiddenException('You can only view this file.');
    return found;
  }

  private async requireOwner(id: string, actor: WorkspaceActor, action: string) {
    const found = await this.access(id, actor);
    if (found.level !== 'owner') throw new ForbiddenException(`Only the owner can ${action}.`);
    return found;
  }

  /** Where new things go: nowhere means My Drive; a folder needs edit access. */
  private async requireDestination(parentId: string | null | undefined, actor: WorkspaceActor) {
    if (!parentId) return null;
    const { item } = await this.requireEdit(parentId, actor);
    if (item.kind !== 'folder') throw new BadRequestException('You can only put files in a folder.');
    return parentId;
  }

  /** For the client account routes, which all answer to the file's owner alone. */
  async assertOwner(id: string, actor: WorkspaceActor, action: string): Promise<void> {
    await this.requireOwner(id, actor, action);
  }

  /* ---------------------------- clients ---------------------------- */

  /**
   * The item and its parent folders, each marked if this client was given it. Clients only ever match their own
   * rows in drive_client_shares: company sharing, including "Everyone at the company", never applies to them.
   */
  private async clientChain(id: string, clientId: string): Promise<{ id: string; name: string; kind: string; trashedAt: Date | null; permission: 'view' | 'comment' | null }[]> {
    return this.db.query(
      `WITH RECURSIVE up AS (
         SELECT id, name, kind, "parentId", "trashedAt", 0 AS depth FROM drive_items WHERE id = $1
         UNION ALL
         SELECT p.id, p.name, p.kind, p."parentId", p."trashedAt", up.depth + 1
         FROM drive_items p JOIN up ON p.id = up."parentId" WHERE up.depth < 100
       )
       SELECT up.id, up.name, up.kind, up."trashedAt",
         (SELECT s.permission FROM drive_client_shares s WHERE s."itemId" = up.id AND s."clientId" = $2) AS permission
       FROM up ORDER BY up.depth`,
      [id, clientId],
    );
  }

  private async requireClientAccess(id: string, clientId: string) {
    const chain = await this.clientChain(id, clientId);
    if (!chain.length || chain[0].trashedAt || !chain.some((link) => link.permission)) throw new NotFoundException(NOT_FOUND);
    return chain;
  }

  /** The strongest level given on the item or a folder above it. */
  private clientLevelOf(chain: { permission: 'view' | 'comment' | null }[]): 'view' | 'comment' | null {
    if (chain.some((link) => link.permission === 'comment')) return 'comment';
    return chain.some((link) => link.permission === 'view') ? 'view' : null;
  }

  async clientLevel(id: string, clientId: string): Promise<'view' | 'comment'> {
    return this.clientLevelOf(await this.requireClientAccess(id, clientId)) as 'view' | 'comment';
  }

  async clientLevelOrNull(id: string, clientId: string): Promise<'view' | 'comment' | null> {
    const chain = await this.clientChain(id, clientId);
    return chain.length && !chain[0].trashedAt ? this.clientLevelOf(chain) : null;
  }

  /* ---------------------------- for comments ---------------------------- */

  async teamLevel(id: string, actor: WorkspaceActor): Promise<DriveAccess> {
    return (await this.requireLive(id, actor)).level;
  }

  async teamCanOpen(id: string, actor: WorkspaceActor): Promise<boolean> {
    const chain = await this.chain(id);
    return chain.length > 0 && !chain[0].trashedAt && !!driveAccessLevel(actor, chain);
  }

  async commentFileInfo(id: string): Promise<{ name: string; ownerId: string | null } | null> {
    const [row] = await this.db.query(`SELECT name, "ownerId" FROM drive_items WHERE id = $1`, [id]);
    return row ?? null;
  }

  /** Whether a client can read shown threads on this file, directly or through a folder above it. */
  async hasCommentingClients(id: string): Promise<boolean> {
    const [row] = await this.db.query(
      `WITH RECURSIVE up AS (
         SELECT id, "parentId", 0 AS depth FROM drive_items WHERE id = $1
         UNION ALL SELECT p.id, p."parentId", up.depth + 1 FROM drive_items p JOIN up ON p.id = up."parentId" WHERE up.depth < 100
       )
       SELECT EXISTS (SELECT 1 FROM drive_client_shares s JOIN up ON up.id = s."itemId" WHERE s.permission = 'comment') AS yes`,
      [id],
    );
    return !!row?.yes;
  }

  /** The fields a client sees, with no team details beyond the owner's name and picture. */
  private async presentToClient(rows: any[]) {
    const users = await this.hubUsers.load(rows.map((r) => r.ownerId));
    return rows.map((r) => {
      const owner = r.ownerId ? users.get(r.ownerId) : null;
      return {
        id: r.id,
        kind: r.kind,
        name: r.name,
        parentId: r.parentId,
        preview: r.preview,
        revision: r.revision,
        contentType: r.contentType,
        sizeBytes: Number(r.sizeBytes || 0),
        trashedAt: null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        owner: owner ? { id: owner.id, name: owner.name, avatarUrl: owner.avatarUrl, role: '' } : null,
        updatedBy: null,
        isOwner: false,
        starred: false,
        lastOpenedAt: null,
      };
    });
  }

  /** With no folder: what was shared with this client directly. With one: what's inside it. */
  async clientList(parentId: string | null, clientId: string) {
    if (parentId) await this.requireClientAccess(parentId, clientId);
    const rows = parentId
      ? await this.db.query(
          `SELECT ${COLUMNS} FROM drive_items i WHERE i."parentId" = $1 AND i."trashedAt" IS NULL
           ORDER BY (i.kind = 'folder') DESC, lower(i.name) LIMIT ${MAX_RESULTS}`,
          [parentId],
        )
      : await this.db.query(
          `SELECT ${COLUMNS} FROM drive_items i JOIN drive_client_shares s ON s."itemId" = i.id
           WHERE s."clientId" = $1 AND i."trashedAt" IS NULL
           ORDER BY (i.kind = 'folder') DESC, i."updatedAt" DESC LIMIT ${MAX_RESULTS}`,
          [clientId],
        );
    return this.presentToClient(rows);
  }

  async clientGet(id: string, clientId: string) {
    const chain = await this.requireClientAccess(id, clientId);
    const [row] = await this.db.query(`SELECT ${COLUMNS}, i."assetId", i."hasLiveState" FROM drive_items i WHERE i.id = $1`, [id]);
    const [detail] = await this.presentToClient([row]);
    // Folders above the one they were given stay hidden.
    const path: { id: string; name: string }[] = [];
    for (let i = 1; i < chain.length; i++) {
      if (!chain.slice(i).some((link) => link.permission)) break;
      path.unshift({ id: chain[i].id, name: chain[i].name });
    }
    return {
      ...detail,
      myAccess: this.clientLevelOf(chain) as 'view' | 'comment',
      path,
      hasLiveState: row.hasLiveState,
      content: EDITABLE_KINDS.includes(row.kind) && !row.hasLiveState ? decodeStored(await this.iceberg.readPrivateText(row.assetId)).content : null,
      assetLinks: EDITABLE_KINDS.includes(row.kind) ? await this.assetLinks(id) : {},
    };
  }

  async clientLink(id: string, clientId: string) {
    await this.requireClientAccess(id, clientId);
    const [row] = await this.db.query(`SELECT "assetId" FROM drive_items WHERE id = $1`, [id]);
    if (!row?.assetId) throw new BadRequestException('This file has nothing to download.');
    return this.iceberg.deliveryLink(row.assetId);
  }

  /** Clients only ever watch a live file: neither of their levels can edit it. */
  async clientLiveAccess(id: string, clientId: string): Promise<'view' | 'comment' | null> {
    const chain = await this.clientChain(id, clientId);
    if (!chain.length || chain[0].trashedAt || !EDITABLE_KINDS.includes(chain[0].kind)) return null;
    return this.clientLevelOf(chain);
  }

  /* ---------------------------- reading ---------------------------- */

  private async decorate(rows: any[], actor: WorkspaceActor) {
    const users = await this.hubUsers.load(rows.flatMap((r) => [r.ownerId, r.updatedById]));
    const state = rows.length
      ? await this.db.query(
          `SELECT "itemId", starred, "lastOpenedAt" FROM drive_item_user_state WHERE "userId" = $1 AND "itemId" = ANY($2::uuid[])`,
          [actor.userId, rows.map((r) => r.id)],
        )
      : [];
    const byItem = new Map<string, any>(state.map((s: any) => [s.itemId, s]));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      name: r.name,
      parentId: r.parentId,
      preview: r.preview,
      revision: r.revision,
      contentType: r.contentType,
      sizeBytes: Number(r.sizeBytes || 0),
      trashedAt: r.trashedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      owner: r.ownerId ? users.get(r.ownerId) ?? null : null,
      updatedBy: r.updatedById ? users.get(r.updatedById) ?? null : null,
      isOwner: r.ownerId === actor.userId,
      starred: !!byItem.get(r.id)?.starred,
      lastOpenedAt: byItem.get(r.id)?.lastOpenedAt ?? null,
    }));
  }

  async list(view: DriveView, parentId: string | undefined, q: string | undefined, actor: WorkspaceActor) {
    const params: unknown[] = [actor.userId, actor.role ?? null];
    let sql: string;
    const search = (q || '').trim();

    if (search) {
      params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
      sql = `${ACCESSIBLE_CTE} SELECT ${COLUMNS} FROM drive_items i JOIN accessible a ON a.id = i.id
             WHERE i."trashedAt" IS NULL AND i.name ILIKE $3 ORDER BY i."updatedAt" DESC LIMIT ${MAX_RESULTS}`;
    } else if (view === 'mine') {
      if (parentId) {
        await this.requireLive(parentId, actor);
        return this.decorate(
          await this.db.query(
            `SELECT ${COLUMNS} FROM drive_items i WHERE i."parentId" = $1 AND i."trashedAt" IS NULL
             ORDER BY (i.kind = 'folder') DESC, lower(i.name)`,
            [parentId],
          ),
          actor,
        );
      }
      params.length = 1;
      sql = `SELECT ${COLUMNS} FROM drive_items i WHERE i."ownerId" = $1
             AND i."parentId" IS NULL AND i."trashedAt" IS NULL ORDER BY (i.kind = 'folder') DESC, lower(i.name)`;
    } else if (view === 'shared') {
      sql = `SELECT ${COLUMNS} FROM drive_items i
             WHERE i."trashedAt" IS NULL AND i."ownerId" IS DISTINCT FROM $1::uuid AND EXISTS (
               SELECT 1 FROM drive_item_shares s WHERE s."itemId" = i.id
                 AND (s.kind = 'everyone' OR (s.kind = 'user' AND s.target = ($1::uuid)::text) OR (s.kind = 'department' AND s.target = $2::text))
             ) ORDER BY i."updatedAt" DESC LIMIT ${MAX_RESULTS}`;
    } else if (view === 'recent') {
      sql = `${ACCESSIBLE_CTE} SELECT ${COLUMNS} FROM drive_items i JOIN accessible a ON a.id = i.id
             LEFT JOIN drive_item_user_state u ON u."itemId" = i.id AND u."userId" = $1::uuid
             WHERE i."trashedAt" IS NULL AND (u."lastOpenedAt" IS NOT NULL OR i."ownerId" = $1::uuid)
             ORDER BY GREATEST(u."lastOpenedAt", i."updatedAt") DESC LIMIT 60`;
    } else if (view === 'starred') {
      sql = `${ACCESSIBLE_CTE} SELECT ${COLUMNS} FROM drive_items i JOIN accessible a ON a.id = i.id
             JOIN drive_item_user_state u ON u."itemId" = i.id AND u."userId" = $1::uuid AND u.starred
             WHERE i."trashedAt" IS NULL ORDER BY (i.kind = 'folder') DESC, lower(i.name)`;
    } else if (view === 'trash') {
      params.length = 1;
      sql = `SELECT ${COLUMNS} FROM drive_items i WHERE i."ownerId" = $1
             AND i."trashedAt" IS NOT NULL AND i."trashRootId" = i.id ORDER BY i."trashedAt" DESC`;
    } else {
      throw new BadRequestException('Unknown view.');
    }
    return this.decorate(await this.db.query(sql, params), actor);
  }

  async storage(actor: WorkspaceActor) {
    const [row] = await this.db.query(
      `SELECT COALESCE(SUM(i."sizeBytes"), 0) AS files,
         COALESCE((SELECT SUM(a."sizeBytes") FROM drive_item_assets a JOIN drive_items p ON p.id = a."itemId" WHERE p."ownerId" = $1), 0) AS images
       FROM drive_items i WHERE i."ownerId" = $1`,
      [actor.userId],
    );
    return { usedBytes: Number(row.files) + Number(row.images) };
  }

  async get(id: string, actor: WorkspaceActor) {
    const { chain, level } = await this.requireLive(id, actor);
    const [row] = await this.db.query(`SELECT ${COLUMNS}, i."assetId", i."hasLiveState" FROM drive_items i WHERE i.id = $1`, [id]);
    await this.db.query(
      `INSERT INTO drive_item_user_state ("itemId", "userId", "lastOpenedAt") VALUES ($1, $2, NOW())
       ON CONFLICT ("itemId", "userId") DO UPDATE SET "lastOpenedAt" = NOW()`,
      [id, actor.userId],
    );
    const [detail] = await this.decorate([row], actor);

    // Only ancestors the person can reach show in the breadcrumb.
    const path: { id: string; name: string }[] = [];
    for (let i = 1; i < chain.length; i++) {
      if (!driveAccessLevel(actor, chain.slice(i))) break;
      path.unshift({ id: chain[i].id, name: chain[i].name });
    }
    return {
      ...detail,
      myAccess: level,
      path,
      hasLiveState: row.hasLiveState,
      content: EDITABLE_KINDS.includes(row.kind) && !row.hasLiveState ? decodeStored(await this.iceberg.readPrivateText(row.assetId)).content : null,
      assetLinks: EDITABLE_KINDS.includes(row.kind) ? await this.assetLinks(id) : {},
    };
  }

  /**
   * Fresh links for this file's pictures. Links expire and live state can't be rewritten on each open, so the
   * editor draws pictures from this map. Only assets listed for this file get one.
   */
  private async assetLinks(id: string): Promise<Record<string, string>> {
    const owned: { assetId: string }[] = await this.db.query(`SELECT "assetId" FROM drive_item_assets WHERE "itemId" = $1`, [id]);
    const links: Record<string, string> = {};
    await Promise.all(
      owned.map(async ({ assetId }) => {
        try {
          links[assetId] = (await this.iceberg.deliveryLink(assetId, 24 * 60 * 60)).url;
        } catch (error: any) {
          this.logger.warn(`No link for asset ${assetId}: ${error?.message || error}`);
        }
      }),
    );
    return links;
  }

  private contentFile(stored: { content?: unknown; yjs?: Uint8Array | null }): Express.Multer.File {
    const buffer = encodeStored(stored);
    return { buffer, originalname: 'content.json', mimetype: 'application/json', size: buffer.length } as Express.Multer.File;
  }

  /* ---------------------------- live editing ---------------------------- */

  /** What a person may do with a file being edited live; trashed files count as no access. */
  async liveAccess(id: string, actor: WorkspaceActor): Promise<DriveAccess | null> {
    const chain = await this.chain(id);
    if (!chain.length || chain[0].trashedAt || !EDITABLE_KINDS.includes(chain[0].kind)) return null;
    return driveAccessLevel(actor, chain);
  }

  async loadLive(id: string): Promise<StoredFile> {
    const [row] = await this.db.query(`SELECT "assetId" FROM drive_items WHERE id = $1`, [id]);
    if (!row?.assetId) throw new NotFoundException(NOT_FOUND);
    return decodeStored(await this.iceberg.readPrivateText(row.assetId));
  }

  async persistLive(id: string, yjs: Uint8Array, userId: string | null): Promise<void> {
    const file = this.contentFile({ yjs });
    if (file.size > MAX_CONTENT_BYTES) throw new BadRequestException('This file is over the 10 MB limit.');
    await this.db.transaction(async (m) => {
      const [current] = await m.query(`SELECT "storageKey" FROM drive_items WHERE id = $1 FOR UPDATE`, [id]);
      if (!current?.storageKey) return;
      const stored = await this.iceberg.replace(current.storageKey, file);
      await m.query(
        `UPDATE drive_items SET "hasLiveState" = TRUE, "sizeBytes" = $2, revision = revision + 1, "updatedAt" = NOW(),
           "updatedById" = COALESCE($3, "updatedById") WHERE id = $1`,
        [id, stored.sizeBytes ?? file.size, userId],
      );
    });
  }

  async link(id: string, actor: WorkspaceActor) {
    await this.requireLive(id, actor);
    const [row] = await this.db.query(`SELECT "assetId" FROM drive_items WHERE id = $1`, [id]);
    if (!row?.assetId) throw new BadRequestException('This file has nothing to download.');
    return this.iceberg.deliveryLink(row.assetId);
  }

  /* ---------------------------- creating ---------------------------- */

  private async insert(fields: Record<string, unknown>) {
    const columns = Object.keys(fields);
    const values = columns.map((c) => {
      const v = fields[c];
      return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
    });
    const [row] = await this.db.query(
      `INSERT INTO drive_items (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${RETURNED}`,
      values,
    );
    return row;
  }

  async create(dto: CreateDriveItemDto, actor: WorkspaceActor) {
    const parentId = await this.requireDestination(dto.parentId, actor);
    assertContentSize(dto.content);
    const stored = dto.kind === 'folder' ? null : await this.iceberg.uploadPrivate(this.contentFile({ content: dto.content }), `drively/${actor.userId}`);
    try {
      const row = await this.insert({
        kind: dto.kind,
        name: cleanName(dto.name, DEFAULT_NAMES[dto.kind]),
        parentId,
        ownerId: actor.userId,
        preview: dto.preview ?? null,
        assetId: stored?.assetId ?? null,
        storageKey: stored?.key ?? null,
        contentType: stored?.contentType ?? null,
        sizeBytes: stored?.sizeBytes ?? 0,
        updatedById: actor.userId,
      });
      const [item] = await this.decorate([row], actor);
      return item;
    } catch (error) {
      if (stored) await this.iceberg.trashAsset(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async upload(files: Express.Multer.File[], parentId: string | null, actor: WorkspaceActor) {
    if (!files?.length) throw new BadRequestException('Pick a file to upload.');
    const destination = await this.requireDestination(parentId, actor);
    const created: any[] = [];
    for (const file of files) {
      // Multer reads multipart filenames as latin1.
      const name = cleanName(Buffer.from(file.originalname, 'latin1').toString('utf8'), DEFAULT_NAMES.file);
      const result = await this.iceberg.uploadPrivate({ ...file, originalname: name }, `drively/${actor.userId}`);
      try {
        created.push(
          await this.insert({
            kind: pdfOrFile(file.mimetype, name),
            name,
            parentId: destination,
            ownerId: actor.userId,
            assetId: result.assetId,
            storageKey: result.key,
            contentType: result.contentType,
            sizeBytes: result.sizeBytes ?? file.size,
            updatedById: actor.userId,
          }),
        );
      } catch (error) {
        await this.iceberg.trashAsset(result.key).catch(() => undefined);
        throw error;
      }
    }
    return this.decorate(created, actor);
  }

  async addImage(id: string, file: Express.Multer.File, actor: WorkspaceActor) {
    await this.requireEdit(id, actor);
    if (!file) throw new BadRequestException('Pick a picture.');
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Use a PNG, JPG, GIF or WebP picture.');
    }
    const result = await this.iceberg.uploadPrivate(file, `drively/${id}`);
    await this.db.query(
      `INSERT INTO drive_item_assets ("itemId", "assetId", "storageKey", name, "contentType", "sizeBytes")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, result.assetId, result.key, cleanName(file.originalname, 'image').slice(0, 255), result.contentType, result.sizeBytes ?? file.size],
    );
    const link = await this.iceberg.deliveryLink(result.assetId, 24 * 60 * 60);
    return { assetId: result.assetId, src: link.url };
  }

  /* ---------------------------- changing ---------------------------- */

  async update(id: string, dto: UpdateDriveItemDto, actor: WorkspaceActor) {
    const { item, level } = await this.requireEdit(id, actor);
    const sets: string[] = ['"updatedById" = $2', '"updatedAt" = NOW()'];
    const params: unknown[] = [id, actor.userId];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`"${column}" = $${params.length}`);
    };

    if (dto.name !== undefined) set('name', cleanName(dto.name, DEFAULT_NAMES[item.kind]));

    if (dto.preview !== undefined) set('preview', JSON.stringify(dto.preview));

    if (dto.parentId !== undefined) {
      // A folder's owner gets edit on what's inside, so moving a file could hand it to someone new.
      if (level !== 'owner') throw new ForbiddenException('Only the owner can move this.');
      await this.requireMove(id, dto.parentId, actor);
      set('parentId', dto.parentId);
    }

    if (dto.content === undefined) {
      const [rows] = await this.db.query(`UPDATE drive_items SET ${sets.join(', ')} WHERE id = $1 RETURNING ${RETURNED}`, params);
      const [updated] = await this.decorate(rows, actor);
      return updated;
    }

    // Whole-file saves are only for filling a file before anyone opens it. After that, edits go through the live session.
    if (!EDITABLE_KINDS.includes(item.kind)) throw new BadRequestException("This file's content can't be edited here.");
    if (!dto.revision) throw new BadRequestException('A save needs the revision it is based on.');
    assertContentSize(dto.content);
    return this.writeBytes(id, dto.revision, this.contentFile({ content: dto.content }), actor, sets, params, true);
  }

  /**
   * Overwrites the Iceberg asset, then records it. The row stays locked throughout, so two saves can't both
   * pass the revision check and leave Iceberg holding whichever happened to finish last.
   */
  private async writeBytes(
    id: string,
    revision: number,
    file: Express.Multer.File,
    actor: WorkspaceActor,
    sets: string[] = ['"updatedById" = $2', '"updatedAt" = NOW()'],
    params: unknown[] = [id, actor.userId],
    refuseLive = false,
  ) {
    const rows = await this.db.transaction(async (m) => {
      const [current] = await m.query(`SELECT revision, "storageKey", "hasLiveState" FROM drive_items WHERE id = $1 FOR UPDATE`, [id]);
      if (!current?.storageKey) throw new BadRequestException("This file can't be replaced.");
      if (current.revision !== revision || (refuseLive && current.hasLiveState)) throw new ConflictException(STALE);
      const stored = await this.iceberg.replace(current.storageKey, file);
      const all = [...params, stored.sizeBytes ?? file.size, stored.contentType];
      const [updated] = await m.query(
        `UPDATE drive_items SET ${sets.join(', ')}, "sizeBytes" = $${all.length - 1}, "contentType" = $${all.length}, revision = revision + 1
         WHERE id = $1 RETURNING ${RETURNED}`,
        all,
      );
      return updated;
    });
    const [saved] = await this.decorate(rows, actor);
    return saved;
  }

  /** A folder can't move into itself or anything inside itself. */
  private async requireMove(id: string, parentId: string | null, actor: WorkspaceActor) {
    if (!parentId) return;
    await this.requireDestination(parentId, actor);
    const chain = await this.chain(parentId);
    if (chain.some((link) => link.id === id)) {
      throw new BadRequestException("A folder can't go inside itself.");
    }
  }

  async replace(id: string, file: Express.Multer.File, revision: number, actor: WorkspaceActor) {
    await this.requireEdit(id, actor);
    if (!file) throw new BadRequestException('Pick a file.');
    return this.writeBytes(id, revision, file, actor);
  }

  async star(id: string, starred: boolean, actor: WorkspaceActor) {
    await this.requireLive(id, actor);
    await this.db.query(
      `INSERT INTO drive_item_user_state ("itemId", "userId", starred) VALUES ($1, $2, $3)
       ON CONFLICT ("itemId", "userId") DO UPDATE SET starred = $3`,
      [id, actor.userId, starred],
    );
    return { starred };
  }

  /** A copy belongs to whoever made it and starts private. Folders aren't copied, the same as Drive. */
  async duplicate(id: string, actor: WorkspaceActor) {
    const { item, level } = await this.requireLive(id, actor);
    if (item.kind === 'folder') throw new BadRequestException("Folders can't be copied yet.");
    await this.flushLive(id);
    const [source] = await this.db.query(`SELECT ${COLUMNS}, i."assetId", i."storageKey", i."hasLiveState" FROM drive_items i WHERE i.id = $1`, [id]);
    const name = cleanName(`Copy of ${source.name}`, DEFAULT_NAMES[source.kind]);
    // A copy lands beside the original only if this person can add to that folder.
    let parentId: string | null = null;
    if (source.parentId && canEdit(level)) parentId = source.parentId;

    let uploaded: IcebergUploadResult | null = null;
    if (source.assetId) uploaded = await this.copyAsset(source, name, actor);

    const row = await this.insert({
      kind: source.kind,
      name,
      parentId,
      ownerId: actor.userId,
      hasLiveState: source.hasLiveState,
      preview: source.preview,
      assetId: uploaded?.assetId ?? null,
      storageKey: uploaded?.key ?? null,
      contentType: source.contentType,
      sizeBytes: uploaded?.sizeBytes ?? source.sizeBytes,
      updatedById: actor.userId,
    });
    await this.db.query(
      `INSERT INTO drive_item_assets ("itemId", "assetId", "storageKey", name, "contentType", "sizeBytes")
       SELECT $1, "assetId", "storageKey", name, "contentType", "sizeBytes" FROM drive_item_assets WHERE "itemId" = $2`,
      [row.id, id],
    );
    const [copy] = await this.decorate([row], actor);
    return copy;
  }

  /** Saving overwrites the asset, so a copy needs bytes of its own. */
  private async copyAsset(source: any, name: string, actor: WorkspaceActor) {
    const { url } = await this.iceberg.deliveryLink(source.assetId, 600);
    const response = await fetch(url);
    if (!response.ok) throw new BadRequestException("Couldn't copy this file.");
    const buffer = Buffer.from(await response.arrayBuffer());
    return this.iceberg.uploadPrivate(
      { buffer, originalname: name, mimetype: source.contentType || 'application/octet-stream', size: buffer.length } as Express.Multer.File,
      `drively/${actor.userId}`,
    );
  }

  /* ---------------------------- trash ---------------------------- */

  async trash(id: string, actor: WorkspaceActor) {
    const { item } = await this.requireOwner(id, actor, 'move this to the trash');
    if (item.trashedAt) return { trashed: true };
    await this.flushLive(id);
    await this.db.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM drive_items WHERE id = $1
         UNION ALL SELECT c.id FROM drive_items c JOIN tree ON c."parentId" = tree.id
       )
       UPDATE drive_items SET "trashedAt" = NOW(), "trashRootId" = $1
       WHERE id IN (SELECT id FROM tree) AND "trashedAt" IS NULL`,
      [id],
    );
    this.onAccessChanged();
    return { trashed: true };
  }

  async restore(id: string, actor: WorkspaceActor) {
    const { chain } = await this.requireOwner(id, actor, 'restore this');
    // If the folder it came from is still in the trash, it comes back to the owner's My Drive.
    const parentGone = chain.length > 1 && !!chain[1].trashedAt;
    await this.db.query(
      `UPDATE drive_items SET "trashedAt" = NULL, "trashRootId" = NULL,
         "parentId" = CASE WHEN id = $1 AND $2 THEN NULL ELSE "parentId" END
       WHERE "trashRootId" = $1`,
      [id, parentGone],
    );
    this.onAccessChanged();
    return { restored: true };
  }

  /**
   * Delete forever: the rows go now, the assets go to Iceberg's own trash and its retention takes over.
   * Files other people put inside a deleted folder aren't this person's to destroy, so they come back out
   * of the trash and land in their owners' My Drive when the folder above them goes.
   */
  async remove(id: string, actor: WorkspaceActor) {
    const { item } = await this.requireOwner(id, actor, 'delete this forever');
    if (!item.trashedAt) throw new BadRequestException('Move it to the trash first.');
    await this.db.query(
      `UPDATE drive_items SET "trashedAt" = NULL, "trashRootId" = NULL
       WHERE "trashRootId" = $1 AND "ownerId" IS NOT NULL AND "ownerId" <> $2`,
      [id, actor.userId],
    );
    const tree: { id: string; storageKey: string | null; assetId: string | null }[] = await this.db.query(
      `SELECT id, "storageKey", "assetId" FROM drive_items WHERE "trashRootId" = $1`,
      [id],
    );
    const ids = tree.map((t) => t.id);
    const assets: { storageKey: string; assetId: string }[] = await this.db.query(
      `SELECT DISTINCT "storageKey", "assetId" FROM drive_item_assets WHERE "itemId" = ANY($1::uuid[])`,
      [ids],
    );
    await this.db.query(`DELETE FROM drive_items WHERE id = ANY($1::uuid[])`, [ids]);

    const stored = [...tree, ...assets].filter((a): a is { storageKey: string; assetId: string } => !!a.storageKey && !!a.assetId);
    for (const { storageKey: key, assetId } of stored) {
      try {
        const [stillUsed] = await this.db.query(`SELECT 1 FROM drive_item_assets WHERE "storageKey" = $1 LIMIT 1`, [key]);
        if (stillUsed) continue;
        await this.iceberg.revokeLinks(assetId);
        await this.iceberg.trashAsset(key);
      } catch (error: any) {
        this.logger.warn(`Could not trash Iceberg asset ${key}: ${error?.message || error}`);
      }
    }
    return { deleted: true };
  }

  /* ---------------------------- sharing ---------------------------- */

  async getShares(id: string, actor: WorkspaceActor) {
    await this.requireLive(id, actor);
    const rows: { kind: string; target: string | null; permission: string }[] = await this.db.query(
      `SELECT kind, target, permission FROM drive_item_shares WHERE "itemId" = $1 ORDER BY "createdAt"`,
      [id],
    );
    const users = await this.hubUsers.load(rows.filter((r) => r.kind === 'user').map((r) => r.target));
    return rows.map((r) => ({ ...r, user: r.kind === 'user' && r.target ? users.get(r.target) ?? null : null }));
  }

  async setShares(id: string, dto: SetDriveSharesDto, actor: WorkspaceActor) {
    await this.requireOwner(id, actor, 'change who has access');
    const shares = normalizeShares(dto.shares);
    await this.db.transaction(async (m) => {
      await m.query(`DELETE FROM drive_item_shares WHERE "itemId" = $1`, [id]);
      for (const s of shares) {
        await m.query(
          `INSERT INTO drive_item_shares ("itemId", kind, target, permission) VALUES ($1, $2, $3, $4)`,
          [id, s.kind, s.target, s.permission],
        );
      }
    });
    this.onAccessChanged();
    return this.getShares(id, actor);
  }
}
