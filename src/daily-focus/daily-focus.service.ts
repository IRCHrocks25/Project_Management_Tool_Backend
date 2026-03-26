import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { DailyFocusItem } from './entities/daily-focus-item.entity';
import { EodReportSnapshot } from './entities/eod-report-snapshot.entity';
import { DepartmentProjectFocusItem } from '../department-project-focus/entities/department-project-focus-item.entity';
import { Task, TaskStatus, TaskType } from '../tasks/entities/task.entity';
import { TaskQuestion } from '../tasks/entities/task-question.entity';
import { UserRole } from '../users/entities/user.entity';
import { UpdateDailyFocusDto } from './dto/update-daily-focus.dto';

/** Task types that can appear on the daily focus board (excludes General if desired — include all enum values) */
export const DAILY_FOCUS_DEPARTMENT_KEYS = Object.values(TaskType) as string[];

/** Hard upper bound to avoid abuse; env DAILY_FOCUS_MAX_RANK must be <= this */
const ABSOLUTE_MAX_RANK = 50;
const PROGRESS_UPDATE_PREFIX = '[PROGRESS_UPDATE]';

@Injectable()
export class DailyFocusService {
  constructor(
    @InjectRepository(DailyFocusItem)
    private readonly dailyFocusRepository: Repository<DailyFocusItem>,
    @InjectRepository(EodReportSnapshot)
    private readonly eodReportSnapshotRepository: Repository<EodReportSnapshot>,
    @InjectRepository(DepartmentProjectFocusItem)
    private readonly departmentProjectFocusRepository: Repository<DepartmentProjectFocusItem>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(TaskQuestion)
    private readonly taskQuestionsRepository: Repository<TaskQuestion>,
    private readonly configService: ConfigService,
  ) {}

  /** Max priorities per department (default 20). DB check constraint must allow this; run migration if raising past old limit. */
  getMaxRank(): number {
    const raw = this.configService.get<string>('DAILY_FOCUS_MAX_RANK', '20');
    const n = parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) return 20;
    return Math.min(n, ABSOLUTE_MAX_RANK);
  }

  /**
   * Start/end of calendar day in ORG_TIMEZONE (default UTC).
   * Tasks store timestamps in UTC; we compare `updatedAt` against this window.
   */
  getOrgDayBounds(dateStr: string): { startUtc: Date; endUtc: Date; timezone: string } {
    const tz = this.configService.get<string>('ORG_TIMEZONE', 'UTC');
    const dt = DateTime.fromISO(dateStr, { zone: tz });
    if (!dt.isValid) {
      throw new BadRequestException(`Invalid date: ${dateStr}. Use YYYY-MM-DD.`);
    }
    const start = dt.startOf('day');
    const end = dt.endOf('day');
    return {
      startUtc: start.toUTC().toJSDate(),
      endUtc: end.toUTC().toJSDate(),
      timezone: tz,
    };
  }

  async findByDate(dateStr: string) {
    this.assertValidDate(dateStr);
    const rows = await this.dailyFocusRepository.find({
      where: { focusDate: dateStr },
      relations: ['task', 'task.project', 'task.assignedTo', 'task.assignees', 'task.assignees.user'],
      order: { departmentKey: 'ASC', rank: 'ASC' },
    });
    return rows.map((r) => this.serializeFocusRow(r));
  }

  async upsert(dto: UpdateDailyFocusDto, userId: string, userRole: UserRole) {
    if (userRole !== UserRole.PROJECT_MANAGER) {
      throw new ForbiddenException('Only Project Managers can update daily focus');
    }
    this.assertValidDate(dto.date);
    const items = dto.items || [];
    const maxRank = this.getMaxRank();

    const byDept = new Map<string, typeof items>();
    for (const item of items) {
      if (!DAILY_FOCUS_DEPARTMENT_KEYS.includes(item.departmentKey)) {
        throw new BadRequestException(`Invalid departmentKey: ${item.departmentKey}`);
      }
      if (item.rank < 1 || item.rank > maxRank || !Number.isInteger(item.rank)) {
        throw new BadRequestException(`rank must be an integer 1..${maxRank}`);
      }
      const list = byDept.get(item.departmentKey) || [];
      list.push(item);
      byDept.set(item.departmentKey, list);
    }

    for (const [dept, list] of byDept) {
      if (list.length > maxRank) {
        throw new BadRequestException(`At most ${maxRank} tasks per department (${dept})`);
      }
      const ranks = list.map((i) => i.rank);
      if (new Set(ranks).size !== ranks.length) {
        throw new BadRequestException(`Duplicate rank for department ${dept}`);
      }
      const taskIds = list.map((i) => i.taskId);
      if (new Set(taskIds).size !== taskIds.length) {
        throw new BadRequestException(`Duplicate task in department ${dept}`);
      }
    }

    const allTaskIds = [...new Set(items.map((i) => i.taskId))];
    if (allTaskIds.length !== items.length) {
      throw new BadRequestException('The same task cannot be pinned twice on the same day');
    }

    const taskById = new Map<string, Task>();
    for (const item of items) {
      const task = await this.tasksRepository.findOne({
        where: { id: item.taskId, isArchived: false },
      });
      if (!task) {
        throw new NotFoundException(`Task not found: ${item.taskId}`);
      }
      taskById.set(task.id, task);
      const typeStr = task.type as string;
      if (typeStr !== item.departmentKey) {
        throw new BadRequestException(
          `Task ${item.taskId} has type "${typeStr}" but departmentKey is "${item.departmentKey}"`,
        );
      }
    }

    await this.dailyFocusRepository.manager.transaction(async (em) => {
      await em.delete(DailyFocusItem, { focusDate: dto.date });
      for (const item of items) {
        const row = em.create(DailyFocusItem, {
          focusDate: dto.date,
          departmentKey: item.departmentKey,
          taskId: item.taskId,
          rank: item.rank,
          createdById: userId,
        });
        await em.save(row);
      }

      // Keep department dashboards synced with PM daily huddle priorities.
      // Persist task-level ordering so department dashboards reflect exact discussed tasks.
      console.log(`[DailyFocus→DeptSync] date=${dto.date} items=${items.length} — deleting old DepartmentProjectFocusItem rows`);
      await em.delete(DepartmentProjectFocusItem, { focusDate: dto.date });

      const byDeptRanked = new Map<string, Array<{ rank: number; taskId: string; projectId: string | null }>>();
      for (const item of items) {
        const task = taskById.get(item.taskId);
        if (!task) continue;
        const list = byDeptRanked.get(item.departmentKey) || [];
        list.push({ rank: item.rank, taskId: task.id, projectId: task.projectId || null });
        byDeptRanked.set(item.departmentKey, list);
      }

      for (const [departmentKey, ranked] of byDeptRanked) {
        ranked.sort((a, b) => a.rank - b.rank);
        const seenTasks = new Set<string>();
        const uniqueRankedTasks = ranked.filter((r) => {
          if (seenTasks.has(r.taskId)) return false;
          seenTasks.add(r.taskId);
          return true;
        });

        console.log(`[DailyFocus→DeptSync] dept=${departmentKey} uniqueTasks=${uniqueRankedTasks.length} (from ${ranked.length} ranked tasks)`);
        let sortOrder = 0;
        for (const row of uniqueRankedTasks.slice(0, 30)) {
          const pin = em.create(DepartmentProjectFocusItem, {
            focusDate: dto.date,
            departmentKey,
            taskId: row.taskId,
            projectId: row.projectId,
            sortOrder: sortOrder++,
            createdById: userId,
          });
          await em.save(pin);
        }
        console.log(`[DailyFocus→DeptSync] dept=${departmentKey} — saved ${sortOrder} DepartmentProjectFocusItem rows for date=${dto.date}`);
      }
    });

    return this.findByDate(dto.date);
  }

  async getEndOfDayReport(dateStr: string) {
    this.assertValidDate(dateStr);
    const { startUtc, endUtc, timezone } = this.getOrgDayBounds(dateStr);

    const plannedRows = await this.dailyFocusRepository.find({
      where: { focusDate: dateStr },
      relations: ['task', 'task.project', 'task.assignedTo', 'task.assignees', 'task.assignees.user'],
      order: { departmentKey: 'ASC', rank: 'ASC' },
    });

    const planned = plannedRows.map((r) => ({
      ...this.serializeFocusRow(r),
      planned: true,
    }));

    const completedTasks = await this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignedTo', 'assignedTo')
      .leftJoinAndSelect('task.assignees', 'assignees')
      .leftJoinAndSelect('assignees.user', 'assigneeUser')
      .where('task.updatedAt BETWEEN :startUtc AND :endUtc', { startUtc, endUtc })
      .andWhere('(task.isCompleted = true OR task.status = :completedStatus)', {
        completedStatus: TaskStatus.COMPLETED,
      })
      .andWhere('task.isArchived = false')
      .orderBy('task.updatedAt', 'DESC')
      .getMany();

    const completed = completedTasks.map((t) => this.serializeTaskForReport(t));

    const completedIds = new Set(completedTasks.map((t) => t.id));

    const notDoneBase = planned.filter((p) => !completedIds.has(p.taskId));

    const notDoneTaskIds = [...new Set(notDoneBase.map((p) => p.taskId).filter(Boolean))];
    const progressByTask = new Map<
      string,
      Array<{ id: string; text: string; createdAt: string; authorName: string }>
    >();
    if (notDoneTaskIds.length > 0) {
      const updates = await this.taskQuestionsRepository
        .createQueryBuilder('q')
        .leftJoinAndSelect('q.user', 'u')
        .where('q.taskId IN (:...taskIds)', { taskIds: notDoneTaskIds })
        .andWhere('q.text LIKE :prefix', { prefix: `${PROGRESS_UPDATE_PREFIX}%` })
        .orderBy('q.createdAt', 'DESC')
        .getMany();

      for (const q of updates) {
        if (progressByTask.has(q.taskId)) continue; // keep latest only (query already DESC)
        const list = progressByTask.get(q.taskId) || [];
        const noteText = this.extractProgressText(q.text);
        if (!noteText) continue;
        list.push({
          id: q.id,
          text: noteText,
          createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : String(q.createdAt),
          authorName: q.user?.name || 'Unknown',
        });
        progressByTask.set(q.taskId, list);
      }
    }

    const notDone = notDoneBase.map((p) => {
      const updates = progressByTask.get(p.taskId) || [];
      return {
        ...p,
        progressUpdates: updates,
        latestProgressUpdate: updates.length > 0 ? updates[0] : null,
      };
    });

    return {
      date: dateStr,
      timezone,
      planned,
      completed,
      notDone,
    };
  }

  async saveEndOfDaySnapshot(dateStr: string, userId: string) {
    const report = await this.getEndOfDayReport(dateStr);
    let row = await this.eodReportSnapshotRepository.findOne({
      where: { reportDate: dateStr },
    });
    if (!row) {
      row = this.eodReportSnapshotRepository.create({
        reportDate: dateStr,
        timezone: report.timezone,
        snapshot: report,
        createdById: userId,
      });
    } else {
      row.timezone = report.timezone;
      row.snapshot = report;
      row.createdById = userId;
    }
    const saved = await this.eodReportSnapshotRepository.save(row);
    return {
      id: saved.id,
      reportDate: saved.reportDate,
      timezone: saved.timezone,
      createdById: saved.createdById,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async listEndOfDaySnapshots() {
    const rows = await this.eodReportSnapshotRepository.find({
      order: { reportDate: 'DESC', updatedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      reportDate: r.reportDate,
      timezone: r.timezone,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getEndOfDaySnapshot(id: string) {
    const row = await this.eodReportSnapshotRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('EOD snapshot not found');
    }
    return {
      id: row.id,
      reportDate: row.reportDate,
      timezone: row.timezone,
      snapshot: row.snapshot,
      createdById: row.createdById,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private assertValidDate(dateStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
    }
    const dt = DateTime.fromISO(dateStr);
    if (!dt.isValid) {
      throw new BadRequestException(`Invalid date: ${dateStr}`);
    }
  }

  private serializeFocusRow(r: DailyFocusItem) {
    const task = r.task;
    const project = task?.project;
    return {
      id: r.id,
      focusDate: r.focusDate,
      departmentKey: r.departmentKey,
      rank: r.rank,
      taskId: r.taskId,
      taskTitle: task?.title ?? '',
      projectId: task?.projectId ?? null,
      projectName: project?.clientName ?? '',
      assigneeName: this.getAssigneeLabel(task),
      taskStatus: task?.status,
      isCompleted: task?.isCompleted,
    };
  }

  private serializeTaskForReport(task: Task) {
    const project = task.project;
    return {
      taskId: task.id,
      taskTitle: task.title,
      departmentKey: task.type as string,
      projectId: task.projectId,
      projectName: project?.clientName ?? '',
      assigneeName: this.getAssigneeLabel(task),
      completedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
      status: task.status,
      isCompleted: task.isCompleted,
    };
  }

  private getAssigneeLabel(task: Task | null | undefined): string {
    if (!task) return '';
    const assignees = task.assignees || [];
    if (assignees.length > 0) {
      const u = assignees[0].user;
      return u?.name || 'Unassigned';
    }
    if (task.assignedTo) {
      return task.assignedTo.name || 'Unassigned';
    }
    return 'Unassigned';
  }

  private extractProgressText(raw: string): string {
    if (!raw) return '';
    if (!raw.startsWith(PROGRESS_UPDATE_PREFIX)) return '';
    return raw.slice(PROGRESS_UPDATE_PREFIX.length).trim();
  }
}
