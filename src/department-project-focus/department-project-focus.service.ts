import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentProjectFocusItem } from './entities/department-project-focus-item.entity';
import { DepartmentProjectFocusOverrideItem } from './entities/department-project-focus-override.entity';
import { DailyFocusItem } from '../daily-focus/entities/daily-focus-item.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UpsertDepartmentProjectFocusDto } from './dto/upsert-department-project-focus.dto';
import { Task, TaskType } from '../tasks/entities/task.entity';

const ALLOWED_DEPT_KEYS = new Set(Object.values(TaskType) as string[]);
const MAX_PROJECTS_PM = 30;
const MAX_PROJECTS_OVERRIDE = 15;

function userRoleToDepartmentKey(role: UserRole): string | null {
  switch (role) {
    case UserRole.COPY_WRITING:
      return 'Copy';
    case UserRole.DESIGNER:
      return 'Design';
    case UserRole.DEVELOPER:
      return 'Dev';
    case UserRole.AI_DEVELOPER:
      return 'AI';
    case UserRole.SOCIAL_MEDIA:
      return 'Social Media';
    case UserRole.CRM:
      return 'CRM';
    case UserRole.SEO_GEO:
      return 'SEO/GEO';
    default:
      return null;
  }
}

export type DepartmentFocusRowView = {
  id: string;
  focusDate: string;
  departmentKey: string;
  sortOrder: number;
  notes: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  clientName: string;
  stage: string;
  pmName: string | null;
  source: 'pm' | 'override';
};

@Injectable()
export class DepartmentProjectFocusService {
  constructor(
    @InjectRepository(DepartmentProjectFocusItem)
    private readonly focusRepository: Repository<DepartmentProjectFocusItem>,
    @InjectRepository(DepartmentProjectFocusOverrideItem)
    private readonly overrideRepository: Repository<DepartmentProjectFocusOverrideItem>,
    @InjectRepository(DailyFocusItem)
    private readonly dailyFocusRepository: Repository<DailyFocusItem>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private assertValidDate(dateStr: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException(`Invalid date: ${dateStr}. Use YYYY-MM-DD.`);
    }
  }

  private mapPmRow(r: DepartmentProjectFocusItem): DepartmentFocusRowView {
    const project = r.task?.project ?? r.project;
    return {
      id: r.id,
      focusDate: r.focusDate,
      departmentKey: r.departmentKey,
      sortOrder: r.sortOrder,
      notes: r.notes,
      taskId: r.taskId ?? null,
      taskTitle: r.task?.title ?? null,
      projectId: r.task?.projectId ?? r.projectId ?? null,
      clientName: project?.clientName ?? '',
      stage: project?.stage ?? '',
      pmName: project?.pm?.name ?? null,
      source: 'pm',
    };
  }

  private mapOverrideRow(r: DepartmentProjectFocusOverrideItem): DepartmentFocusRowView {
    const project = r.task?.project ?? r.project;
    return {
      id: r.id,
      focusDate: r.focusDate,
      departmentKey: r.departmentKey,
      sortOrder: r.sortOrder,
      notes: null,
      taskId: r.taskId ?? null,
      taskTitle: r.task?.title ?? null,
      projectId: r.task?.projectId ?? r.projectId ?? null,
      clientName: project?.clientName ?? '',
      stage: project?.stage ?? '',
      pmName: project?.pm?.name ?? null,
      source: 'override',
    };
  }

  /** Fallback: derive PM task priorities directly from Daily Focus task pins for this date/department. */
  private async buildPmRowsFromDailyFocusFallback(
    dateStr: string,
    departmentKey: string,
  ): Promise<DepartmentFocusRowView[]> {
    const rows = await this.dailyFocusRepository.find({
      where: { focusDate: dateStr, departmentKey },
      relations: ['task', 'task.project', 'task.project.pm'],
      order: { rank: 'ASC', createdAt: 'ASC' },
    });

    const out: DepartmentFocusRowView[] = [];
    let sortOrder = 0;
    for (const row of rows) {
      const taskId = row.task?.id ?? row.taskId;
      if (!taskId) continue;
      out.push({
        id: `dailyfocus:${row.id}`,
        focusDate: dateStr,
        departmentKey,
        sortOrder: sortOrder++,
        notes: null,
        taskId,
        taskTitle: row.task?.title ?? null,
        projectId: row.task?.projectId ?? null,
        clientName: row.task?.project?.clientName ?? '',
        stage: row.task?.project?.stage ?? '',
        pmName: row.task?.project?.pm?.name ?? null,
        source: 'pm',
      });
      if (out.length >= MAX_PROJECTS_PM) break;
    }
    return out;
  }

  /** PM or Head PM — canonical per-department pins. */
  async assertCanEditPmPins(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.PROJECT_MANAGER || user.isHeadPM) {
      return user;
    }
    throw new ForbiddenException(
      'Only Project Managers or Head PMs can set department priorities for the team.',
    );
  }

  /** Team lead for that department, or PM / Head PM (support). */
  async assertCanEditTeamOverride(userId: string, departmentKey: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.PROJECT_MANAGER || user.isHeadPM) {
      return user;
    }
    const dk = userRoleToDepartmentKey(user.role);
    if (user.isTeamLead && dk === departmentKey) {
      return user;
    }
    throw new ForbiddenException(
      'Only the team lead for this department (or a PM / Head PM) can edit team add-on priorities.',
    );
  }

  async findByDateAndDepartment(
    dateStr: string,
    departmentKey: string,
  ): Promise<DepartmentFocusRowView[]> {
    this.assertValidDate(dateStr);
    if (!ALLOWED_DEPT_KEYS.has(departmentKey)) {
      throw new BadRequestException(`Invalid departmentKey: ${departmentKey}`);
    }
    const pmRows = await this.focusRepository.find({
      where: { focusDate: dateStr, departmentKey },
      relations: ['project', 'project.pm', 'task', 'task.project', 'task.project.pm'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const ovRows = await this.overrideRepository.find({
      where: { focusDate: dateStr, departmentKey },
      relations: ['project', 'project.pm', 'task', 'task.project', 'task.project.pm'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    console.log(
      `[DeptFocus:GET] date=${dateStr} dept=${departmentKey} → pmRows=${pmRows.length} ovRows=${ovRows.length}` +
        (pmRows.length > 0
          ? ` pmFocusDates=[${pmRows.map((r) => r.focusDate).join(',')}]`
          : ' (will try dailyFocus fallback)'),
    );

    const pmMapped =
      pmRows.length > 0
        ? pmRows.map((r) => this.mapPmRow(r))
        : await this.buildPmRowsFromDailyFocusFallback(dateStr, departmentKey);

    if (pmRows.length === 0) {
      console.log(
        `[DeptFocus:GET] dailyFocus fallback returned ${pmMapped.length} derived PM rows`,
      );
    }

    const pmTaskIds = new Set(pmMapped.map((r) => r.taskId).filter(Boolean));
    const ovFiltered = ovRows
      .filter((r) => !r.taskId || !pmTaskIds.has(r.taskId))
      .map((r) => this.mapOverrideRow(r));

    return [...pmMapped, ...ovFiltered];
  }

  async upsertPmPins(dto: UpsertDepartmentProjectFocusDto, userId: string) {
    await this.assertCanEditPmPins(userId);
    this.assertValidDate(dto.date);
    if (!ALLOWED_DEPT_KEYS.has(dto.departmentKey)) {
      throw new BadRequestException(`Invalid departmentKey: ${dto.departmentKey}`);
    }
    const taskIds = await this.normalizeAndValidateTaskIds(dto, dto.departmentKey, MAX_PROJECTS_PM);

    await this.focusRepository.manager.transaction(async (em) => {
      await em.delete(DepartmentProjectFocusItem, {
        focusDate: dto.date,
        departmentKey: dto.departmentKey,
      });
      let order = 0;
      for (const taskId of taskIds) {
        const task = await em.findOne(Task, {
          where: { id: taskId },
          relations: ['project'],
        });
        if (!task) continue;
        const row = em.create(DepartmentProjectFocusItem, {
          focusDate: dto.date,
          departmentKey: dto.departmentKey,
          taskId,
          projectId: task.projectId,
          sortOrder: order++,
          createdById: userId,
        });
        await em.save(row);
      }
    });

    return this.findByDateAndDepartment(dto.date, dto.departmentKey);
  }

  async upsertTeamOverride(dto: UpsertDepartmentProjectFocusDto, userId: string) {
    await this.assertCanEditTeamOverride(userId, dto.departmentKey);
    this.assertValidDate(dto.date);
    if (!ALLOWED_DEPT_KEYS.has(dto.departmentKey)) {
      throw new BadRequestException(`Invalid departmentKey: ${dto.departmentKey}`);
    }
    const taskIds = await this.normalizeAndValidateTaskIds(
      dto,
      dto.departmentKey,
      MAX_PROJECTS_OVERRIDE,
    );

    const pmRows = await this.focusRepository.find({
      where: { focusDate: dto.date, departmentKey: dto.departmentKey },
      select: ['taskId'],
    });
    const pmTaskIds = new Set(pmRows.map((r) => r.taskId).filter(Boolean));
    const conflict = taskIds.find((id) => pmTaskIds.has(id));
    if (conflict) {
      throw new BadRequestException(
        'Team add-ons cannot duplicate a task already set by PM priorities for this day.',
      );
    }

    await this.overrideRepository.manager.transaction(async (em) => {
      await em.delete(DepartmentProjectFocusOverrideItem, {
        focusDate: dto.date,
        departmentKey: dto.departmentKey,
      });
      let order = 0;
      for (const taskId of taskIds) {
        const task = await em.findOne(Task, {
          where: { id: taskId },
          relations: ['project'],
        });
        if (!task) continue;
        const row = em.create(DepartmentProjectFocusOverrideItem, {
          focusDate: dto.date,
          departmentKey: dto.departmentKey,
          taskId,
          projectId: task.projectId,
          sortOrder: order++,
          createdById: userId,
        });
        await em.save(row);
      }
    });

    return this.findByDateAndDepartment(dto.date, dto.departmentKey);
  }

  private async normalizeAndValidateTaskIds(
    dto: UpsertDepartmentProjectFocusDto,
    departmentKey: string,
    maxItems: number,
  ): Promise<string[]> {
    const directTaskIds = [...new Set(dto.taskIds || [])];
    const legacyProjectIds = [...new Set(dto.projectIds || [])];
    const taskIds: string[] = [];

    if (directTaskIds.length > 0) {
      taskIds.push(...directTaskIds);
    } else if (legacyProjectIds.length > 0) {
      // Legacy fallback: map project selections to one active task per project for this department.
      for (const projectId of legacyProjectIds) {
        const task = await this.tasksRepository.findOne({
          where: { projectId, type: departmentKey as TaskType, isArchived: false },
          order: { updatedAt: 'DESC' },
        });
        if (!task) {
          throw new NotFoundException(
            `No task found in department ${departmentKey} for project ${projectId}`,
          );
        }
        taskIds.push(task.id);
      }
    }

    const uniqueTaskIds = [...new Set(taskIds)];
    if (uniqueTaskIds.length > maxItems) {
      throw new BadRequestException(`At most ${maxItems} priority tasks per day`);
    }

    for (const tid of uniqueTaskIds) {
      const task = await this.tasksRepository.findOne({ where: { id: tid, isArchived: false } });
      if (!task) {
        throw new NotFoundException(`Task not found: ${tid}`);
      }
      if ((task.type as string) !== departmentKey) {
        throw new BadRequestException(
          `Task ${tid} has type "${task.type}" but departmentKey is "${departmentKey}"`,
        );
      }
    }

    return uniqueTaskIds;
  }
}
