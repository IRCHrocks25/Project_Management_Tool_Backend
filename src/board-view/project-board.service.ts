import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { Deliverable, DeliverableType } from '../deliverables/entities/deliverable.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskAttachment } from '../tasks/entities/task-attachment.entity';
import { BoardColumn, BoardColumnLabel, BoardColumnType } from '../tasks/entities/board-column.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { getTaskColumn } from './utils/task-kanban-column';

export interface BoardColumnInput {
  name: string;
  type: BoardColumnType;
  labels?: string[];
}

const COLUMN_TYPES: BoardColumnType[] = ['text', 'number', 'status', 'date', 'people', 'checkbox', 'link'];
const LABEL_COLORS = ['#0f766e', '#15803d', '#b45309', '#b91c1c', '#475569', '#0e7490', '#a16207', '#57534e'];
const UNASSIGNED_ID = '__unassigned__';

const day = (value: Date | string | null | undefined): string | null =>
  value ? new Date(value).toISOString().slice(0, 10) : null;

/** One project shown as a board: its deliverables are the groups, its tasks are the rows. */
@Injectable()
export class ProjectBoardService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Deliverable) private readonly deliverables: Repository<Deliverable>,
    @InjectRepository(Task) private readonly tasks: Repository<Task>,
    @InjectRepository(BoardColumn) private readonly columns: Repository<BoardColumn>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** Same visibility as /board-view: every signed-in person sees every active project. */
  async listBoards() {
    const rows = await this.projects.find({
      where: { isArchived: false, isCompleted: false },
      select: ['id', 'clientName', 'priority', 'createdAt'],
      order: { clientName: 'ASC' },
    });
    return rows.map((p) => ({ id: p.id, name: p.clientName, priority: p.priority }));
  }

  async getBoard(projectId: string) {
    const project = await this.projects.findOne({
      where: { id: projectId, isArchived: false },
      relations: ['pm'],
    });
    if (!project) throw new NotFoundException('Project not found');

    const [deliverables, tasks, columns] = await Promise.all([
      this.deliverables.find({ where: { projectId }, order: { createdAt: 'ASC' } }),
      this.tasks
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.assignedTo', 'assignedTo')
        .leftJoinAndSelect('task.assignees', 'taskAssignee')
        .leftJoinAndSelect('taskAssignee.user', 'assignee')
        .where('task.projectId = :projectId', { projectId })
        .andWhere('task.isArchived = false')
        .orderBy('task.createdAt', 'ASC')
        .getMany(),
      this.columns.find({ where: { projectId }, order: { position: 'ASC', createdAt: 'ASC' } }),
    ]);

    const taskIds = tasks.map((t) => t.id);
    const [attachments, updateCounts, lastEditors] = await Promise.all([
      taskIds.length === 0
        ? Promise.resolve([] as TaskAttachment[])
        : this.tasks.manager.find(TaskAttachment, {
            where: { taskId: In(taskIds) },
            select: ['id', 'taskId', 'filename', 'kind', 'mimeType', 'url'],
            order: { createdAt: 'ASC' },
          }),
      this.countUpdates(taskIds),
      this.lastEditors(taskIds),
    ]);

    const groups = deliverables.map((d) => ({
      id: d.id,
      name: d.type === DeliverableType.OTHER && d.customType ? d.customType : d.type,
      renamable: d.type === DeliverableType.OTHER,
    }));
    if (tasks.some((t) => !t.deliverableId) || groups.length === 0) {
      groups.push({ id: UNASSIGNED_ID, name: 'General', renamable: false });
    }

    return {
      project: {
        id: project.id,
        name: project.clientName,
        priority: project.priority,
        clientType: project.clientType ?? null,
        pm: project.pm ? { id: project.pm.id, name: project.pm.name, avatarUrl: project.pm.avatarUrl ?? null } : null,
      },
      groups,
      columns,
      tasks: tasks.map((task) => {
        const column = getTaskColumn({
          status: task.status,
          isCompleted: task.isCompleted,
          description: task.description,
          assignedToId: task.assignedToId,
        });
        const owners = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
        for (const a of task.assignees || []) {
          if (a.user) owners.set(a.user.id, { id: a.user.id, name: a.user.name, avatarUrl: a.user.avatarUrl ?? null });
        }
        if (task.assignedTo && !owners.has(task.assignedTo.id)) {
          owners.set(task.assignedTo.id, { id: task.assignedTo.id, name: task.assignedTo.name, avatarUrl: task.assignedTo.avatarUrl ?? null });
        }
        const editor = lastEditors.get(task.id);
        return {
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          type: task.type,
          status: task.status,
          stageId: column.id,
          isCompleted: task.isCompleted,
          description: task.description ?? null,
          assignedToId: task.assignedToId ?? null,
          deliverableId: task.deliverableId || null,
          dueDate: day(task.dueDate),
          startDate: day(task.startDate),
          priority: task.priority ?? null,
          notes: task.notes ?? null,
          customFields: task.customFields || {},
          owners: Array.from(owners.values()),
          updatedAt: editor && editor.at > task.updatedAt ? editor.at : task.updatedAt,
          updatedBy: editor ? { id: editor.id, name: editor.name, avatarUrl: editor.avatarUrl } : null,
          updateCount: updateCounts.get(task.id) ?? 0,
          files: attachments
            .filter((a) => a.taskId === task.id)
            .map((a) => ({ id: a.id, filename: a.filename, kind: a.kind, mimeType: a.mimeType, url: a.url })),
        };
      }),
    };
  }

  private async countUpdates(taskIds: string[]): Promise<Map<string, number>> {
    if (taskIds.length === 0) return new Map();
    const rows: { taskId: string; count: string }[] = await this.tasks.query(
      `SELECT q."taskId" AS "taskId", COUNT(q.id) + COUNT(c.id) AS count
         FROM task_questions q
         LEFT JOIN task_comments c ON c."questionId" = q.id
        WHERE q."taskId" = ANY($1::uuid[])
        GROUP BY q."taskId"`,
      [taskIds],
    );
    return new Map(rows.map((row) => [row.taskId, Number(row.count)]));
  }

  private async lastEditors(taskIds: string[]) {
    const editors = new Map<string, { id: string | null; name: string; avatarUrl: string | null; at: Date }>();
    if (taskIds.length === 0) return editors;
    const rows: any[] = await this.tasks.query(
      `SELECT DISTINCT ON (log."taskId") log."taskId", log."actorId", log."actorName", log."createdAt", u."avatarUrl"
         FROM task_activity_logs log
         LEFT JOIN users u ON u.id = log."actorId"
        WHERE log."taskId" = ANY($1::uuid[])
        ORDER BY log."taskId", log."createdAt" DESC`,
      [taskIds],
    );
    for (const row of rows) {
      editors.set(row.taskId, {
        id: row.actorId,
        name: row.actorName || 'Unknown',
        avatarUrl: row.avatarUrl ?? null,
        at: new Date(row.createdAt),
      });
    }
    return editors;
  }

  // ── Columns ────────────────────────────────────────────────────────────────

  /** Anyone can fill in a column. Changing the board's shape is for PMs, the CEO and department heads. */
  private async assertCanManage(userId: string): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId }, select: ['id', 'role', 'isTeamLead', 'isHeadPM'] });
    const allowed =
      !!user &&
      (user.role === UserRole.PROJECT_MANAGER || user.role === UserRole.FOUNDER_CEO || user.isTeamLead || user.isHeadPM);
    if (!allowed) throw new ForbiddenException('Only PMs and department heads can change board columns');
  }

  private cleanName(name: unknown): string {
    const cleaned = typeof name === 'string' ? name.trim() : '';
    if (!cleaned || cleaned.length > 80) throw new BadRequestException('A column needs a name of up to 80 characters');
    return cleaned;
  }

  private buildLabels(labels: unknown, keep: BoardColumnLabel[] = []): BoardColumnLabel[] {
    if (!Array.isArray(labels)) throw new BadRequestException('Labels must be a list');
    const names = Array.from(new Set(labels.map((l) => (typeof l === 'string' ? l.trim() : '')).filter(Boolean)));
    if (names.length === 0 || names.length > 20 || names.some((n) => n.length > 40)) {
      throw new BadRequestException('A status column needs 1 to 20 labels of up to 40 characters');
    }
    return names.map((label, i) => ({
      label,
      color: keep.find((k) => k.label === label)?.color ?? LABEL_COLORS[i % LABEL_COLORS.length],
    }));
  }

  private async findColumn(projectId: string, columnId: string): Promise<BoardColumn> {
    const column = await this.columns.findOne({ where: { id: columnId, projectId } });
    if (!column) throw new NotFoundException('Column not found');
    return column;
  }

  async addColumn(projectId: string, input: BoardColumnInput, userId: string): Promise<BoardColumn> {
    await this.assertCanManage(userId);
    const project = await this.projects.findOne({ where: { id: projectId }, select: ['id'] });
    if (!project) throw new NotFoundException('Project not found');
    if (!COLUMN_TYPES.includes(input?.type)) throw new BadRequestException('Unknown column type');

    const last = await this.columns.findOne({ where: { projectId }, order: { position: 'DESC' }, select: ['id', 'position'] });
    return this.columns.save(
      this.columns.create({
        projectId,
        name: this.cleanName(input.name),
        type: input.type,
        labels: input.type === 'status' ? this.buildLabels(input.labels) : [],
        position: (last?.position ?? -1) + 1,
        createdById: userId,
      }),
    );
  }

  async updateColumn(projectId: string, columnId: string, input: Partial<BoardColumnInput>, userId: string): Promise<BoardColumn> {
    await this.assertCanManage(userId);
    const column = await this.findColumn(projectId, columnId);
    if (input.name !== undefined) column.name = this.cleanName(input.name);
    if (input.labels !== undefined && column.type === 'status') column.labels = this.buildLabels(input.labels, column.labels);
    return this.columns.save(column);
  }

  async reorderColumns(projectId: string, columnIds: unknown, userId: string) {
    await this.assertCanManage(userId);
    if (!Array.isArray(columnIds)) throw new BadRequestException('columnIds must be a list');
    const existing = await this.columns.find({ where: { projectId }, select: ['id'] });
    await Promise.all(
      existing.map((column) => {
        const position = columnIds.indexOf(column.id);
        return position >= 0 ? this.columns.update(column.id, { position }) : Promise.resolve();
      }),
    );
    return this.columns.find({ where: { projectId }, order: { position: 'ASC', createdAt: 'ASC' } });
  }

  async deleteColumn(projectId: string, columnId: string, userId: string) {
    await this.assertCanManage(userId);
    await this.findColumn(projectId, columnId);
    await this.tasks.manager.transaction(async (em) => {
      await em.delete(BoardColumn, { id: columnId, projectId });
      await em.query(`UPDATE tasks SET "customFields" = "customFields" - $1 WHERE "projectId" = $2 AND "customFields" ? $1`, [columnId, projectId]);
    });
    return { deleted: true };
  }
}
