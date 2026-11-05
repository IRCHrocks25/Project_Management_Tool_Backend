import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { Brackets, DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { HubUsersService, SafeUser } from '../products/hub-users.service';
import { IcebergService } from '../shared/iceberg.service';
import { User, UserRole } from '../users/entities/user.entity';
import { CreatePageDto, PageShareDto, SetPageSharesDto, ToggleChecklistDto, UpdatePageDto } from './dto/workspace.dto';
import { WorkspacePageShare } from './entities/workspace-page-share.entity';
import { WorkspacePage } from './entities/workspace-page.entity';
import { checklistCounts, docProblem, emptyDoc, excerptOf, extractText, setTaskItemChecked } from './tiptap';
import { PageAccessLevel, WorkspaceActor, namedShareUserIds, pageAccessLevel } from './workspace-access';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const STALE_PAGE_MESSAGE = 'Someone else changed this page. Reload to see the latest version.';

const NOT_FOUND_MESSAGE = 'Page not found.';
const EDIT_FORBIDDEN_MESSAGE = 'You can only view this page.';
const OWNER_ONLY_MESSAGE = 'Only the owner of this page can do that.';
const MAX_LIST = 200;
const MAX_TASK_RESULTS = 10;
const SHARE_KIND_ORDER = { everyone: 0, department: 1, user: 2 };
// SVGs can carry scripts and these are served from a public CDN.
const IMAGE_MIMETYPE = /^image\/(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i;

const LIST_COLUMNS: (keyof WorkspacePage)[] = [
  'id',
  'ownerId',
  'title',
  'contentText',
  'checklistDone',
  'checklistTotal',
  'updatedById',
  'updatedAt',
];

const cleanTitle = (title: string | null | undefined) =>
  (title ?? '').replace(/\0/g, '').trim().slice(0, 200) || 'Untitled';

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

const derivedFrom = (content: any) => {
  const counts = checklistCounts(content);
  return { contentText: extractText(content), checklistDone: counts.done, checklistTotal: counts.total };
};

const assertValidDoc = (content: any) => {
  const problem = docProblem(content);
  if (problem) throw new BadRequestException(problem);
};

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    @InjectRepository(WorkspacePage) private readonly pagesRepo: Repository<WorkspacePage>,
    @InjectRepository(WorkspacePageShare) private readonly sharesRepo: Repository<WorkspacePageShare>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hubUsers: HubUsersService,
    private readonly notifications: NotificationsService,
    private readonly iceberg: IcebergService,
  ) {}

  // ---------------------------------------------------------------- helpers

  /** The page and the actor's level, or 404 for anyone without access. */
  private async getAccessible(id: string, actor: WorkspaceActor) {
    const page = await this.pagesRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!page) throw new NotFoundException(NOT_FOUND_MESSAGE);
    const shares = await this.sharesRepo.find({ where: { pageId: id } });
    const level = pageAccessLevel(actor, page, shares);
    if (!level) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return { page, shares, level };
  }

  private toSummary(
    page: WorkspacePage,
    shares: WorkspacePageShare[],
    level: PageAccessLevel,
    users: Map<string, SafeUser>,
  ) {
    return {
      id: page.id,
      title: page.title,
      owner: page.ownerId ? (users.get(page.ownerId) ?? null) : null,
      myAccess: level,
      sharedWith: {
        everyone: shares.some((s) => s.kind === 'everyone'),
        departments: shares.filter((s) => s.kind === 'department').map((s) => s.target as string),
        userCount: shares.filter((s) => s.kind === 'user').length,
      },
      checklist: { done: page.checklistDone, total: page.checklistTotal },
      excerpt: excerptOf(page.contentText),
      updatedAt: page.updatedAt,
      updatedBy: page.updatedById ? (users.get(page.updatedById) ?? null) : null,
    };
  }

  private async toDetail(page: WorkspacePage, shares: WorkspacePageShare[], level: PageAccessLevel) {
    const users = await this.hubUsers.load([page.ownerId, page.updatedById]);
    return {
      ...this.toSummary(page, shares, level, users),
      content: page.content,
      revision: page.revision,
      createdAt: page.createdAt,
    };
  }

  private async detailAfterWrite(id: string, actor: WorkspaceActor) {
    const { page, shares, level } = await this.getAccessible(id, actor);
    return this.toDetail(page, shares, level);
  }

  private assertCanEdit(level: PageAccessLevel) {
    if (level === 'view') throw new ForbiddenException(EDIT_FORBIDDEN_MESSAGE);
  }

  private assertOwner(level: PageAccessLevel) {
    if (level !== 'owner') throw new ForbiddenException(OWNER_ONLY_MESSAGE);
  }

  /** Saves only if nobody else got there first. */
  private async writeIfCurrent(id: string, revision: number, set: Partial<WorkspacePage>) {
    const result = await this.pagesRepo
      .createQueryBuilder()
      .update(WorkspacePage)
      .set({ ...set, revision: () => 'revision + 1' } as any)
      .where('id = :id AND revision = :revision AND "deletedAt" IS NULL', { id, revision })
      .execute();
    if (!result.affected) throw new ConflictException(STALE_PAGE_MESSAGE);
  }

  private async insertPage(ownerId: string, title: string, content: any) {
    const repo = this.pagesRepo;
    return repo.save(
      repo.create({
        ownerId,
        title,
        content,
        ...derivedFrom(content),
        revision: 1,
        updatedById: ownerId,
      }),
    );
  }

  // ---------------------------------------------------------------- pages

  async list(view: string, q: string | undefined, actor: WorkspaceActor) {
    if (view !== 'mine' && view !== 'shared') throw new BadRequestException('View must be mine or shared.');
    const query = this.pagesRepo
      .createQueryBuilder('p')
      .select(LIST_COLUMNS.map((c) => `p.${c}`))
      .where('p.deletedAt IS NULL');

    if (view === 'mine') {
      query.andWhere('p.ownerId = :userId', { userId: actor.userId });
    } else {
      query.andWhere('(p.ownerId IS NULL OR p.ownerId <> :userId)', { userId: actor.userId }).andWhere(
        `EXISTS (
           SELECT 1 FROM workspace_page_shares s
            WHERE s."pageId" = p.id
              AND (s.kind = 'everyone'
                OR (s.kind = 'department' AND s.target = :role)
                OR (s.kind = 'user' AND s.target = :targetUserId))
         )`,
        // A separate parameter: Postgres would otherwise type this one as uuid, from the ownerId comparison.
        { role: actor.role ?? '', targetUserId: actor.userId },
      );
    }

    const term = (q ?? '').replace(/\0/g, '').trim();
    if (term) {
      const like = `%${escapeLike(term)}%`;
      query.andWhere(
        new Brackets((b) => b.where('p.title ILIKE :like', { like }).orWhere('p.contentText ILIKE :like', { like })),
      );
    }

    const pages = await query.orderBy('p.updatedAt', 'DESC').take(MAX_LIST).getMany();
    if (!pages.length) return [];
    const [shares, users] = await Promise.all([
      this.sharesRepo.find({ where: { pageId: In(pages.map((p) => p.id)) } }),
      this.hubUsers.load(pages.flatMap((p) => [p.ownerId, p.updatedById])),
    ]);
    const sharesByPage = new Map<string, WorkspacePageShare[]>();
    for (const share of shares) sharesByPage.set(share.pageId, [...(sharesByPage.get(share.pageId) ?? []), share]);
    return pages.flatMap((page) => {
      const pageShares = sharesByPage.get(page.id) ?? [];
      const level = pageAccessLevel(actor, page, pageShares);
      return level ? [this.toSummary(page, pageShares, level, users)] : [];
    });
  }

  async create(dto: CreatePageDto, actor: WorkspaceActor) {
    const content = dto.content ?? emptyDoc();
    assertValidDoc(content);
    const page = await this.insertPage(actor.userId, cleanTitle(dto.title), content);
    return this.detailAfterWrite(page.id, actor);
  }

  async get(id: string, actor: WorkspaceActor) {
    const { page, shares, level } = await this.getAccessible(id, actor);
    await this.recordOpen(id, actor.userId);
    return this.toDetail(page, shares, level);
  }

  /** Only feeds My Day, so a failure here never stops the page from opening. */
  private async recordOpen(pageId: string, userId: string) {
    try {
      await this.dataSource.query(
        `INSERT INTO workspace_page_opens ("pageId", "userId", "openedAt") VALUES ($1, $2, NOW())
         ON CONFLICT ("pageId", "userId") DO UPDATE SET "openedAt" = NOW()`,
        [pageId, userId],
      );
    } catch (error) {
      this.logger.warn(`Could not record page open: ${error?.message || error}`);
    }
  }

  async update(id: string, dto: UpdatePageDto, actor: WorkspaceActor) {
    const { page, shares, level } = await this.getAccessible(id, actor);
    this.assertCanEdit(level);

    const set: Partial<WorkspacePage> = {};
    if (dto.title != null) set.title = cleanTitle(dto.title);
    if (dto.content != null) {
      assertValidDoc(dto.content);
      Object.assign(set, { content: dto.content }, derivedFrom(dto.content));
    }
    if (!Object.keys(set).length) {
      // Nothing to save, but a stale client should still find out.
      if (dto.revision !== page.revision) throw new ConflictException(STALE_PAGE_MESSAGE);
      return this.toDetail(page, shares, level);
    }
    await this.writeIfCurrent(id, dto.revision, { ...set, updatedById: actor.userId });
    return this.detailAfterWrite(id, actor);
  }

  async remove(id: string, actor: WorkspaceActor) {
    const { level } = await this.getAccessible(id, actor);
    this.assertOwner(level);
    await this.pagesRepo.update({ id }, { deletedAt: new Date() });
    return { success: true };
  }

  async duplicate(id: string, actor: WorkspaceActor) {
    const { page } = await this.getAccessible(id, actor);
    const copy = await this.insertPage(actor.userId, cleanTitle(`${page.title.slice(0, 190)} (copy)`), page.content);
    return this.detailAfterWrite(copy.id, actor);
  }

  async toggleChecklist(id: string, dto: ToggleChecklistDto, actor: WorkspaceActor) {
    const { page, level } = await this.getAccessible(id, actor);
    this.assertCanEdit(level);
    const content = setTaskItemChecked(page.content, dto.index, dto.text, dto.checked);
    if (!content) throw new ConflictException(STALE_PAGE_MESSAGE);
    await this.writeIfCurrent(id, page.revision, { content, ...derivedFrom(content), updatedById: actor.userId });
    return this.detailAfterWrite(id, actor);
  }

  // ---------------------------------------------------------------- shares

  private async toShareResponses(shares: WorkspacePageShare[]) {
    const users = await this.hubUsers.load(shares.filter((s) => s.kind === 'user').map((s) => s.target));
    return [...shares]
      .sort((a, b) => SHARE_KIND_ORDER[a.kind] - SHARE_KIND_ORDER[b.kind] || (a.target ?? '').localeCompare(b.target ?? ''))
      .map((s) => ({
        kind: s.kind,
        target: s.target,
        permission: s.permission,
        ...(s.kind === 'user' ? { user: users.get(s.target as string) ?? null } : {}),
      }));
  }

  async getShares(id: string, actor: WorkspaceActor) {
    const { shares } = await this.getAccessible(id, actor);
    return this.toShareResponses(shares);
  }

  /** Checks each share and merges repeats so the strongest permission stays. The owner never needs a share. */
  private async normalizeShares(input: PageShareDto[], ownerId: string | null) {
    const roles = Object.values(UserRole) as string[];
    const merged = new Map<string, { kind: PageShareDto['kind']; target: string | null; permission: 'view' | 'edit' }>();
    for (const share of input) {
      let target: string | null = null;
      if (share.kind === 'department') {
        if (!share.target || !roles.includes(share.target)) throw new BadRequestException('That department does not exist.');
        target = share.target;
      } else if (share.kind === 'user') {
        if (!share.target || !isUUID(share.target)) throw new BadRequestException('Choose a person to share with.');
        target = share.target.toLowerCase();
        if (target === ownerId) continue;
      }
      const key = `${share.kind}:${target ?? ''}`;
      const existing = merged.get(key);
      merged.set(key, { kind: share.kind, target, permission: existing?.permission === 'edit' ? 'edit' : share.permission });
    }
    const shares = [...merged.values()];
    const userIds = shares.filter((s) => s.kind === 'user').map((s) => s.target);
    const known = await this.hubUsers.load(userIds);
    if (userIds.some((userId) => !known.has(userId as string))) {
      throw new BadRequestException('One of those people does not exist.');
    }
    return shares;
  }

  async setShares(id: string, dto: SetPageSharesDto, actor: WorkspaceActor) {
    const { page, level } = await this.getAccessible(id, actor);
    this.assertOwner(level);
    const next = await this.normalizeShares(dto.shares, page.ownerId);

    const previous = await this.dataSource.transaction(async (m: EntityManager) => {
      await m.query(`SELECT id FROM workspace_pages WHERE id = $1 FOR UPDATE`, [id]);
      const repo = m.getRepository(WorkspacePageShare);
      const before = await repo.find({ where: { pageId: id } });
      await repo.delete({ pageId: id });
      if (next.length) {
        await repo.insert(next.map((share) => ({ ...share, pageId: id, createdById: actor.userId })));
      }
      return before;
    });

    await this.notifyNewlyShared(page, previous, next, actor);
    return this.toShareResponses(await this.sharesRepo.find({ where: { pageId: id } }));
  }

  /** People newly named by a user or department share. `everyone` never mails, and neither does a repeat save. */
  private async notifyNewlyShared(
    page: WorkspacePage,
    previous: WorkspacePageShare[],
    next: { kind: string; target: string | null; permission: string }[],
    actor: WorkspaceActor,
  ) {
    try {
      if (!next.some((s) => s.kind !== 'everyone')) return;
      const active = await this.usersRepo.find({ select: ['id', 'role'], where: { isActive: true } });
      const before = namedShareUserIds(previous, active);
      const recipients = [...namedShareUserIds(next, active)].filter(
        (userId) => !before.has(userId) && userId !== actor.userId && userId !== page.ownerId,
      );
      if (!recipients.length) return;
      const actorUser = await this.hubUsers.findOne(actor.userId);
      await Promise.all(
        recipients.map((userId) =>
          this.notifications
            .create({
              type: NotificationType.PAGE_SHARED,
              title: `${actorUser?.name || 'Someone'} shared a page with you`,
              message: page.title,
              userId,
              link: `/pages/${page.id}`,
            })
            .catch((error) => this.logger.warn(`Page share notification for user ${userId} failed: ${error?.message || error}`)),
        ),
      );
    } catch (error) {
      this.logger.warn(`Page share notifications for page ${page.id} failed: ${error?.message || error}`);
    }
  }

  // ---------------------------------------------------------------- images

  async uploadImage(id: string, files: Express.Multer.File[], actor: WorkspaceActor) {
    const { level } = await this.getAccessible(id, actor);
    this.assertCanEdit(level);
    const file = files?.[0];
    if (!file) throw new BadRequestException('Choose an image to upload.');
    if (!IMAGE_MIMETYPE.test(file.mimetype || '')) throw new BadRequestException('Only image files can be added to a page.');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Images must be 10 MB or smaller.');
    const result = await this.iceberg.upload(file, `workspace-pages/${id}`);
    return { url: result.url };
  }

  // ---------------------------------------------------------------- task search

  async searchTasks(q: string | undefined) {
    const term = (q ?? '').replace(/\0/g, '').trim();
    if (!term) return [];
    const rows = await this.dataSource.query(
      `SELECT t.id, t.title, t."projectId", p."clientName" AS "projectName"
         FROM tasks t
         JOIN projects p ON p.id = t."projectId"
        WHERE t."isArchived" = false
          AND p."isArchived" = false
          AND t.title ILIKE $1
        ORDER BY t."updatedAt" DESC
        LIMIT ${MAX_TASK_RESULTS}`,
      [`%${escapeLike(term)}%`],
    );
    return rows;
  }
}
