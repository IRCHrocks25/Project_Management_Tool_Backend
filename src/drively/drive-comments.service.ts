/**
 * Comments on Drively files, for team members and clients. Team threads stay hidden from clients unless the author
 * shows them, so a file can be shared with a client without exposing what the team says about it.
 */
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { HubUsersService } from '../products/hub-users.service';
import { publicAppUrl } from '../shared/public-app-url';
import { WorkspaceActor } from '../workspace/workspace-access';
import { cleanAnchor, cleanCommentBody, commentSnippet } from './drive-comment.logic';
import { CreateCommentDto } from './dto/drive-comment.dto';
import { DriveAccess, canComment } from './drively.logic';
import { DrivelyService } from './drively.service';

export type CommentActor =
  | { kind: 'team'; actor: WorkspaceActor }
  | { kind: 'client'; clientId: string; name: string };

interface CommentRow {
  id: string;
  itemId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorClientId: string | null;
  authorIsClient: boolean;
  authorName: string;
  body: string;
  visibility: 'team' | 'everyone';
  anchor: unknown;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

const NOT_FOUND = 'Comment not found.';

@Injectable()
export class DriveCommentsService {
  private readonly logger = new Logger(DriveCommentsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly drive: DrivelyService,
    private readonly hubUsers: HubUsersService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** A person with no access gets 404 from these, the same as for the file. */
  private level(itemId: string, who: CommentActor): Promise<DriveAccess> {
    return who.kind === 'client' ? this.drive.clientLevel(itemId, who.clientId) : this.drive.teamLevel(itemId, who.actor);
  }

  private isMine(row: CommentRow, who: CommentActor) {
    return who.kind === 'client' ? row.authorClientId === who.clientId : row.authorUserId === who.actor.userId;
  }

  private present(row: CommentRow, who: CommentActor, level: DriveAccess) {
    return {
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      authorIsClient: row.authorIsClient,
      mine: this.isMine(row, who),
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      canDelete: this.isMine(row, who) || level === 'owner',
    };
  }

  async list(itemId: string, who: CommentActor) {
    const level = await this.level(itemId, who);
    // A client who can only view doesn't take part in the conversation. Team members can read it at any level.
    if (who.kind === 'client' && level !== 'comment') throw new ForbiddenException('You can only view this file.');
    const rows: CommentRow[] = await this.db.query(
      `SELECT c.* FROM drive_comments c
       LEFT JOIN drive_comments p ON p.id = c."parentId"
       WHERE c."itemId" = $1 AND ($2::boolean OR COALESCE(p.visibility, c.visibility) = 'everyone')
       ORDER BY c."createdAt"`,
      [itemId, who.kind === 'team'],
    );
    const replies = new Map<string, CommentRow[]>();
    for (const row of rows) {
      if (row.parentId) replies.set(row.parentId, [...(replies.get(row.parentId) || []), row]);
    }
    return {
      canComment: canComment(level),
      isClient: who.kind === 'client',
      clientsCanComment: who.kind === 'team' ? await this.drive.hasCommentingClients(itemId) : false,
      threads: rows
        .filter((row) => !row.parentId)
        .map((row) => ({
          ...this.present(row, who, level),
          anchor: row.anchor,
          visibility: row.visibility,
          resolvedAt: row.resolvedAt,
          resolvedByName: row.resolvedByName,
          canResolve: who.kind === 'team' ? canComment(level) : this.isMine(row, who),
          replies: (replies.get(row.id) || []).map((reply) => this.present(reply, who, level)),
        })),
    };
  }

  private async authorFields(who: CommentActor) {
    if (who.kind === 'client') return { userId: null, clientId: who.clientId, isClient: true, name: who.name };
    const me = await this.hubUsers.findOne(who.actor.userId);
    return { userId: who.actor.userId, clientId: null, isClient: false, name: me?.name || 'Someone' };
  }

  async create(itemId: string, dto: CreateCommentDto, who: CommentActor) {
    const level = await this.level(itemId, who);
    if (!canComment(level)) throw new ForbiddenException('You can only view this file.');
    const body = cleanCommentBody(dto.body);

    let parent: CommentRow | null = null;
    if (dto.parentId) {
      [parent] = await this.db.query(`SELECT * FROM drive_comments WHERE id = $1 AND "itemId" = $2 AND "parentId" IS NULL`, [dto.parentId, itemId]);
      if (!parent || (who.kind === 'client' && parent.visibility !== 'everyone')) throw new NotFoundException(NOT_FOUND);
    }
    const visibility = parent ? parent.visibility : who.kind === 'client' || dto.showToClients ? 'everyone' : 'team';
    const anchor = parent ? null : cleanAnchor(dto.anchor);
    const author = await this.authorFields(who);

    const [row]: CommentRow[] = await this.db.query(
      `INSERT INTO drive_comments ("itemId", "parentId", "authorUserId", "authorClientId", "authorIsClient", "authorName", body, visibility, anchor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [itemId, parent?.id ?? null, author.userId, author.clientId, author.isClient, author.name, body, visibility, anchor ? JSON.stringify(anchor) : null],
    );
    // A new reply brings a settled thread back, so it isn't missed.
    if (parent?.resolvedAt) await this.db.query(`UPDATE drive_comments SET "resolvedAt" = NULL, "resolvedByName" = NULL WHERE id = $1`, [parent.id]);
    void this.notify(row, parent, who).catch((error) => this.logger.warn(`Comment alerts for ${row.id} failed: ${error?.message || error}`));
    return { id: row.id };
  }

  /** The comment, if this person can see it, with their level on its file. */
  private async visible(commentId: string, who: CommentActor) {
    const [row]: (CommentRow & { threadVisibility: string })[] = await this.db.query(
      `SELECT c.*, COALESCE(p.visibility, c.visibility) AS "threadVisibility"
       FROM drive_comments c LEFT JOIN drive_comments p ON p.id = c."parentId" WHERE c.id = $1`,
      [commentId],
    );
    if (!row) throw new NotFoundException(NOT_FOUND);
    const level = await this.level(row.itemId, who);
    if (who.kind === 'client' && (level !== 'comment' || row.threadVisibility !== 'everyone')) throw new NotFoundException(NOT_FOUND);
    return { row, level };
  }

  async update(commentId: string, rawBody: string, who: CommentActor) {
    const { row, level } = await this.visible(commentId, who);
    if (!this.isMine(row, who) || !canComment(level)) throw new ForbiddenException('You can only change your own comments.');
    await this.db.query(`UPDATE drive_comments SET body = $2, "editedAt" = NOW() WHERE id = $1`, [commentId, cleanCommentBody(rawBody)]);
    return { updated: true };
  }

  async remove(commentId: string, who: CommentActor) {
    const { row, level } = await this.visible(commentId, who);
    if (!this.isMine(row, who) && level !== 'owner') throw new ForbiddenException('You can only delete your own comments.');
    await this.db.query(`DELETE FROM drive_comments WHERE id = $1`, [commentId]);
    return { deleted: true };
  }

  async resolve(commentId: string, resolved: boolean, who: CommentActor) {
    const { row, level } = await this.visible(commentId, who);
    if (row.parentId) throw new NotFoundException(NOT_FOUND);
    const allowed = who.kind === 'team' ? canComment(level) : this.isMine(row, who);
    if (!allowed) throw new ForbiddenException("You can't resolve this comment.");
    const { name } = await this.authorFields(who);
    await this.db.query(`UPDATE drive_comments SET "resolvedAt" = $2, "resolvedByName" = $3 WHERE id = $1`, [commentId, resolved ? new Date() : null, resolved ? name : null]);
    return { resolved };
  }

  /* ---------------------------- alerts ---------------------------- */

  /**
   * Tells the file's owner and whoever is already in the thread. Everyone is re-checked first, so someone who has lost
   * access or can't see a team-only thread never gets its words in their inbox.
   */
  private async notify(row: CommentRow, parent: CommentRow | null, who: CommentActor) {
    const thread: CommentRow[] = parent
      ? await this.db.query(`SELECT * FROM drive_comments WHERE id = $1 OR "parentId" = $1`, [parent.id])
      : [row];
    const file = await this.drive.commentFileInfo(row.itemId);
    if (!file) return;
    const verb = parent ? 'replied on' : 'commented on';
    const title = `${row.authorName} ${verb} ${file.name}`;
    const message = commentSnippet(row.body);

    const teamIds = new Set<string>(thread.map((c) => c.authorUserId).filter((id): id is string => !!id));
    if (file.ownerId) teamIds.add(file.ownerId);
    if (who.kind === 'team') teamIds.delete(who.actor.userId);
    const people = await this.hubUsers.load([...teamIds]);
    await Promise.all(
      [...people.values()].map(async (person) => {
        if (!(await this.drive.teamCanOpen(row.itemId, { userId: person.id, role: person.role }))) return;
        await this.notifications.create({ type: NotificationType.DRIVE_COMMENT, title, message, userId: person.id, link: `/drively/d/${row.itemId}` });
      }),
    );

    if (row.visibility !== 'everyone') return;
    const clientIds = new Set<string>(thread.map((c) => c.authorClientId).filter((id): id is string => !!id));
    if (who.kind === 'client') clientIds.delete(who.clientId);
    if (clientIds.size === 0) return;
    const clients: { id: string; name: string; email: string | null }[] = await this.db.query(`SELECT id, name, email FROM drive_clients WHERE id = ANY($1::uuid[]) AND email IS NOT NULL`, [[...clientIds]]);
    const base = publicAppUrl(this.config.get<string>('FRONTEND_URL', ''));
    await Promise.all(
      clients.map(async (client) => {
        if ((await this.drive.clientLevelOrNull(row.itemId, client.id)) !== 'comment') return;
        await this.email.sendNotification({
          to: client.email as string,
          userName: client.name,
          title,
          message,
          viewLink: base ? `${base}/client/d/${row.itemId}` : undefined,
          viewLabel: 'Open the file',
          footer: 'You got this because you commented on this file.',
        });
      }),
    );
  }
}
