import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { Deliverable, DeliverableType } from '../deliverables/entities/deliverable.entity';
import { Task } from '../tasks/entities/task.entity';
import { getTaskColumn } from './utils/task-kanban-column';

export interface AssigneeNode {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface TaskNode {
  id: string;
  title: string;
  type: string;
  status: string;
  kanbanColumnId: string;
  kanbanColumnLabel: string;
  isCompleted: boolean;
  dueDate: string | null;
  deliverableId: string | null;
  description: string | null;
  assignees: AssigneeNode[];
}

export interface DeliverableNode {
  id: string;
  name: string;
  status: string | null;
  rollup: { total: number; done: number };
  minDueDate: string | null;
  maxDueDate: string | null;
  tasks: TaskNode[];
}

export interface ProjectNode {
  id: string;
  name: string;
  priority: string;
  clientType: string | null;
  pm: { id: string; name: string; avatarUrl: string | null } | null;
  clientStartDate: string | null;
  targetCloseMonth: string;
  rollup: { total: number; done: number };
  deliverables: DeliverableNode[];
}

export interface BoardViewSort {
  column: 'name' | 'priority' | 'timeline' | 'pm' | 'status';
  direction: 'asc' | 'desc';
}

export interface BoardViewOptions {
  page: number;
  pageSize: number;
  projectId?: string;
  search?: string;
  dept?: string[];
  pm?: string[];
  status?: string[];      // kanban column ids
  priority?: string[];
  assignee?: string[];
  sort?: BoardViewSort;
}

export interface BoardViewResponse {
  projects: ProjectNode[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const UNASSIGNED_ID = '__unassigned__';

@Injectable()
export class BoardViewService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
    @InjectRepository(Deliverable)
    private readonly deliverablesRepository: Repository<Deliverable>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
  ) {}

  /*
   * Returns the Tuesday board tree paginated + filtered + sorted.
   *
   * Visibility (Phase 5b decision): all authenticated users see all
   * active (non-archived, non-completed) projects. The PM-only gate
   * that mirrored projects.service.ts:findAll has been dropped — see
   * CLAUDE.md "Behavior Changes". Other surfaces (PMDashboard, /projects)
   * keep their per-PM scoping.
   *
   * Two execution paths:
   *   - Path A (fast): pure SQL pagination via skip/take. Used when no
   *     status filter is active and no L1 status sort is requested.
   *   - Path B (in-memory): when status filter or status sort is in
   *     play, kanbanColumnId can't be expressed as a SQL column
   *     (computed via getTaskColumn from task.status + isCompleted +
   *     description markers). Load all candidate projects + their tasks,
   *     compute kanbanColumnId, filter/sort in-memory, then paginate.
   */
  async getBoardView(opts: BoardViewOptions): Promise<BoardViewResponse> {
    const timerLabel = `[BoardView] page=${opts.page} size=${opts.pageSize}${
      opts.search ? ` q=${opts.search}` : ''
    }${opts.status?.length ? ` status=${opts.status.join(',')}` : ''}${
      opts.sort ? ` sort=${opts.sort.column}:${opts.sort.direction}` : ''
    }`;
    console.time(timerLabel);
    try {
      return await this.buildTree(opts);
    } finally {
      console.timeEnd(timerLabel);
    }
  }

  private async buildTree(opts: BoardViewOptions): Promise<BoardViewResponse> {
    const usesInMemoryPath =
      (opts.status && opts.status.length > 0) || opts.sort?.column === 'status';

    const projectsQb = this.buildBaseProjectsQuery(opts);

    if (!usesInMemoryPath && opts.sort) {
      applySqlSort(projectsQb, opts.sort);
    } else {
      projectsQb.orderBy('project.createdAt', 'DESC');
    }

    if (usesInMemoryPath) {
      return await this.buildTreeInMemoryPath(projectsQb, opts);
    }
    return await this.buildTreeSqlPath(projectsQb, opts);
  }

  // ── Query construction (shared by both paths) ────────────────────────────

  private buildBaseProjectsQuery(opts: BoardViewOptions): SelectQueryBuilder<Project> {
    const qb = this.projectsRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.pm', 'pm')
      .where('project.isArchived = :archived', { archived: false })
      .andWhere('project.isCompleted = :completed', { completed: false });

    if (opts.projectId) {
      qb.andWhere('project.id = :projectId', { projectId: opts.projectId });
    }

    // Direct WHEREs on project columns
    if (opts.pm && opts.pm.length > 0) {
      qb.andWhere('project."pmId" IN (:...pmIds)', { pmIds: opts.pm });
    }
    if (opts.priority && opts.priority.length > 0) {
      qb.andWhere('project.priority IN (:...priorities)', { priorities: opts.priority });
    }

    // Search (project name OR task title substring)
    if (opts.search && opts.search.trim()) {
      qb.andWhere(
        `(project."clientName" ILIKE :searchPattern OR EXISTS (
          SELECT 1 FROM tasks t
          WHERE t."projectId" = project.id
            AND t."isArchived" = false
            AND t.title ILIKE :searchPattern
        ))`,
        { searchPattern: `%${opts.search.trim()}%` },
      );
    }

    // Department (task.type IN) — EXISTS subquery
    if (opts.dept && opts.dept.length > 0) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM tasks t
           WHERE t."projectId" = project.id
             AND t."isArchived" = false
             AND t.type::text IN (:...deptTypes)
         )`,
        { deptTypes: opts.dept },
      );
    }

    // Assignee — EXISTS subquery joining task_assignees + checking legacy assignedToId
    if (opts.assignee && opts.assignee.length > 0) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM tasks t
           LEFT JOIN task_assignees ta ON ta."taskId" = t.id
           WHERE t."projectId" = project.id
             AND t."isArchived" = false
             AND (ta."userId" IN (:...assigneeIds) OR t."assignedToId" IN (:...assigneeIds))
         )`,
        { assigneeIds: opts.assignee },
      );
    }

    return qb;
  }

  // ── Path A: pure SQL pagination ──────────────────────────────────────────

  private async buildTreeSqlPath(
    projectsQb: SelectQueryBuilder<Project>,
    opts: BoardViewOptions,
  ): Promise<BoardViewResponse> {
    projectsQb.skip((opts.page - 1) * opts.pageSize).take(opts.pageSize);
    const [projects, totalCount] = await projectsQb.getManyAndCount();

    if (projects.length === 0) {
      return emptyResponse(opts, totalCount);
    }

    const projectNodes = await this.loadAndAssembleProjectNodes(projects);

    return {
      projects: projectNodes,
      totalCount,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.ceil(totalCount / opts.pageSize),
    };
  }

  // ── Path B: in-memory pagination (status filter or status sort) ──────────

  private async buildTreeInMemoryPath(
    projectsQb: SelectQueryBuilder<Project>,
    opts: BoardViewOptions,
  ): Promise<BoardViewResponse> {
    const candidateProjects = await projectsQb.getMany();
    if (candidateProjects.length === 0) {
      return emptyResponse(opts, 0);
    }

    let projectNodes = await this.loadAndAssembleProjectNodes(candidateProjects);

    // In-memory status filter
    if (opts.status && opts.status.length > 0) {
      const statusSet = new Set(opts.status);
      projectNodes = projectNodes.filter((p) => {
        for (const d of p.deliverables) {
          for (const t of d.tasks) {
            if (statusSet.has(t.kanbanColumnId)) return true;
          }
        }
        return false;
      });
    }

    // In-memory status sort (rollup completion ratio)
    if (opts.sort?.column === 'status') {
      const sign = opts.sort.direction === 'asc' ? 1 : -1;
      projectNodes.sort((a, b) => {
        const aRatio = a.rollup.total > 0 ? a.rollup.done / a.rollup.total : 0;
        const bRatio = b.rollup.total > 0 ? b.rollup.done / b.rollup.total : 0;
        return sign * (aRatio - bRatio);
      });
    }

    const totalCount = projectNodes.length;
    const startIdx = (opts.page - 1) * opts.pageSize;
    const paginated = projectNodes.slice(startIdx, startIdx + opts.pageSize);

    return {
      projects: paginated,
      totalCount,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.ceil(totalCount / opts.pageSize),
    };
  }

  // ── Shared assembly: load deliverables + tasks for a set of projects, build nodes ──

  private async loadAndAssembleProjectNodes(projects: Project[]): Promise<ProjectNode[]> {
    const projectIds = projects.map((p) => p.id);

    const [deliverables, tasks] = await Promise.all([
      this.deliverablesRepository.find({
        where: { projectId: In(projectIds) },
        order: { createdAt: 'ASC' },
      }),
      this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.assignedTo', 'assignedTo')
        .leftJoinAndSelect('task.assignees', 'taskAssignee')
        .leftJoinAndSelect('taskAssignee.user', 'assignee')
        .where('task.projectId IN (:...projectIds)', { projectIds })
        .andWhere('task.isArchived = :archived', { archived: false })
        .orderBy('task.createdAt', 'ASC')
        .getMany(),
    ]);

    const deliverablesByProject = groupBy(deliverables, (d) => d.projectId);
    const tasksByProject = groupBy(tasks, (t) => t.projectId);

    return projects.map((project) =>
      this.buildProjectNode(
        project,
        deliverablesByProject.get(project.id) || [],
        tasksByProject.get(project.id) || [],
      ),
    );
  }

  // ── Per-project node assembly (unchanged from previous version) ──────────

  private buildProjectNode(
    project: Project,
    projectDeliverables: Deliverable[],
    projectTasks: Task[],
  ): ProjectNode {
    const tasksByDeliverable = groupBy(projectTasks, (t) => t.deliverableId || UNASSIGNED_ID);

    const deliverableNodes: DeliverableNode[] = projectDeliverables.map((d) =>
      this.buildDeliverableNode(d.id, deliverableName(d), d.status, tasksByDeliverable.get(d.id) || []),
    );

    const orphanTasks = tasksByDeliverable.get(UNASSIGNED_ID) || [];
    if (orphanTasks.length > 0) {
      deliverableNodes.push(
        this.buildDeliverableNode(UNASSIGNED_ID, 'Unassigned', null, orphanTasks),
      );
    }

    const projectRollup = deliverableNodes.reduce(
      (acc, d) => ({ total: acc.total + d.rollup.total, done: acc.done + d.rollup.done }),
      { total: 0, done: 0 },
    );

    return {
      id: project.id,
      name: project.clientName,
      priority: project.priority,
      clientType: project.clientType ?? null,
      pm: project.pm
        ? { id: project.pm.id, name: project.pm.name, avatarUrl: project.pm.avatarUrl ?? null }
        : null,
      clientStartDate: project.clientStartDate ? project.clientStartDate.toISOString() : null,
      targetCloseMonth: project.targetCloseMonth,
      rollup: projectRollup,
      deliverables: deliverableNodes,
    };
  }

  private buildDeliverableNode(
    id: string,
    name: string,
    status: string | null,
    tasks: Task[],
  ): DeliverableNode {
    const taskNodes = tasks.map((t) => this.buildTaskNode(t));
    const dueDates = taskNodes
      .map((t) => t.dueDate)
      .filter((d): d is string => !!d)
      .sort();
    const done = taskNodes.filter((t) => t.kanbanColumnId === 'approved_completed').length;

    return {
      id,
      name,
      status,
      rollup: { total: taskNodes.length, done },
      minDueDate: dueDates[0] || null,
      maxDueDate: dueDates[dueDates.length - 1] || null,
      tasks: taskNodes,
    };
  }

  private buildTaskNode(task: Task): TaskNode {
    const column = getTaskColumn({
      status: task.status,
      isCompleted: task.isCompleted,
      description: task.description,
      assignedToId: task.assignedToId,
    });

    const assigneeMap = new Map<string, AssigneeNode>();
    for (const a of task.assignees || []) {
      if (a.user) {
        assigneeMap.set(a.user.id, {
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl ?? null,
        });
      }
    }
    if (task.assignedTo && !assigneeMap.has(task.assignedTo.id)) {
      assigneeMap.set(task.assignedTo.id, {
        id: task.assignedTo.id,
        name: task.assignedTo.name,
        avatarUrl: task.assignedTo.avatarUrl ?? null,
      });
    }

    return {
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      kanbanColumnId: column.id,
      kanbanColumnLabel: column.label,
      isCompleted: task.isCompleted,
      dueDate: task.dueDate ? toIsoDate(task.dueDate) : null,
      deliverableId: task.deliverableId || null,
      description: task.description ?? null,
      assignees: Array.from(assigneeMap.values()),
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function applySqlSort(qb: SelectQueryBuilder<Project>, sort: BoardViewSort): void {
  const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
  switch (sort.column) {
    case 'name':
      qb.orderBy('project."clientName"', dir, 'NULLS LAST');
      break;
    case 'priority':
      // Map enum values to ordinal positions; Urgent=0, ..., Low=3.
      qb.orderBy(
        `CASE project.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END`,
        dir,
      );
      break;
    case 'timeline':
      qb.orderBy('project."clientStartDate"', dir, 'NULLS LAST');
      break;
    case 'pm':
      qb.orderBy('pm.name', dir, 'NULLS LAST');
      break;
    // 'status' is handled in the in-memory path; not reachable here.
    // 'department' is rejected at the controller layer.
    default:
      qb.orderBy('project."createdAt"', 'DESC');
  }
}

function deliverableName(d: Deliverable): string {
  if (d.type === DeliverableType.OTHER && d.customType) return d.customType;
  return d.type;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function emptyResponse(opts: BoardViewOptions, totalCount: number): BoardViewResponse {
  return {
    projects: [],
    totalCount,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / opts.pageSize),
  };
}
