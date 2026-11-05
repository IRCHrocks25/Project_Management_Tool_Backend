import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Raw, Repository } from 'typeorm';
import { DailyFocusService } from '../daily-focus/daily-focus.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { WorkspacePage } from './entities/workspace-page.entity';
import { listTaskItems } from './tiptap';
import { WorkspaceActor } from './workspace-access';

const MAX_TASKS = 30;
const MAX_CHECKLIST = 20;
const MAX_MENTIONS = 10;
const MAX_RECENT_PAGES = 6;

const MENTION_TYPES = [
  NotificationType.MENTION,
  NotificationType.PRODUCT_MENTION,
  NotificationType.PRODUCT_REPLY,
  NotificationType.PAGE_SHARED,
];

const ASSIGNED_TO_ME_SQL = `(
  t."assignedToId" = $1
  OR EXISTS (SELECT 1 FROM task_assignees a WHERE a."taskId" = t.id AND a."userId" = $1)
)`;

const TASK_COLUMNS_SQL = `t.id, t.title, t."projectId", p."clientName" AS "projectName", t.status::text AS status, t."dueDate"::text AS "dueDate"`;

const toTask = (today: string) => (r: any) => ({
  id: r.id,
  title: r.title,
  projectId: r.projectId,
  projectName: r.projectName,
  status: r.status,
  dueDate: r.dueDate,
  overdue: !!r.dueDate && r.dueDate < today && r.status !== 'Completed',
});

@Injectable()
export class MyDayService {
  constructor(
    @InjectRepository(WorkspacePage) private readonly pagesRepo: Repository<WorkspacePage>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dailyFocus: DailyFocusService,
  ) {}

  async get(actor: WorkspaceActor) {
    const date = this.dailyFocus.getOrgToday();
    const [tasks, focus, checklist, mentions, recentPages] = await Promise.all([
      this.tasks(actor.userId, date),
      this.focus(actor.userId, date),
      this.checklist(actor.userId),
      this.mentions(actor.userId),
      this.recentPages(actor),
    ]);
    return { date, tasks, focus, checklist, mentions, recentPages };
  }

  private async tasks(userId: string, today: string) {
    const rows = await this.dataSource.query(
      `SELECT ${TASK_COLUMNS_SQL}
         FROM tasks t
         JOIN projects p ON p.id = t."projectId"
        WHERE t."isArchived" = false
          AND p."isArchived" = false
          AND t.status::text <> 'Completed'
          AND t."dueDate" <= $2::date
          AND ${ASSIGNED_TO_ME_SQL}
        ORDER BY t."dueDate" ASC, t.title ASC
        LIMIT ${MAX_TASKS}`,
      [userId, today],
    );
    return rows.map(toTask(today));
  }

  private async focus(userId: string, today: string) {
    const rows = await this.dataSource.query(
      `SELECT ${TASK_COLUMNS_SQL}
         FROM daily_focus_items f
         JOIN tasks t ON t.id = f."taskId"
         JOIN projects p ON p.id = t."projectId"
        WHERE f."focusDate" = $2::date
          AND t."isArchived" = false
          AND ${ASSIGNED_TO_ME_SQL}
        ORDER BY f.rank ASC, f."departmentKey" ASC`,
      [userId, today],
    );
    return rows.map(toTask(today));
  }

  /** Every page with an open item adds at least one, so the newest MAX_CHECKLIST pages are always enough. */
  private async checklist(userId: string) {
    const pages = await this.pagesRepo.find({
      select: ['id', 'title', 'content'],
      where: {
        ownerId: userId,
        deletedAt: IsNull(),
        checklistTotal: Raw((alias) => `${alias} > "checklistDone"`),
      },
      order: { updatedAt: 'DESC' },
      take: MAX_CHECKLIST,
    });
    const items: { pageId: string; pageTitle: string; index: number; text: string }[] = [];
    for (const page of pages) {
      for (const item of listTaskItems(page.content)) {
        if (item.checked) continue;
        if (items.length === MAX_CHECKLIST) return items;
        items.push({ pageId: page.id, pageTitle: page.title, index: item.index, text: item.text });
      }
    }
    return items;
  }

  private async mentions(userId: string) {
    return this.dataSource.query(
      `SELECT n.id, n.title, n.message, n.link, n."projectId", n."taskId", n."createdAt"
         FROM notifications n
        WHERE n."userId" = $1
          AND n."isRead" = false
          AND n.type::text = ANY($2::text[])
        ORDER BY n."createdAt" DESC
        LIMIT ${MAX_MENTIONS}`,
      [userId, MENTION_TYPES],
    );
  }

  /** Pages since unshared or deleted drop out here. */
  private async recentPages(actor: WorkspaceActor) {
    return this.dataSource.query(
      `SELECT p.id, p.title, o."openedAt"
         FROM workspace_page_opens o
         JOIN workspace_pages p ON p.id = o."pageId"
        WHERE o."userId" = $1
          AND p."deletedAt" IS NULL
          AND (
            p."ownerId" = $1
            OR EXISTS (
              SELECT 1 FROM workspace_page_shares s
               WHERE s."pageId" = p.id
                 AND (s.kind = 'everyone'
                   OR (s.kind = 'department' AND s.target = $2)
                   OR (s.kind = 'user' AND s.target = $1::text))
            )
          )
        ORDER BY o."openedAt" DESC
        LIMIT ${MAX_RECENT_PAGES}`,
      [actor.userId, actor.role ?? ''],
    );
  }
}
