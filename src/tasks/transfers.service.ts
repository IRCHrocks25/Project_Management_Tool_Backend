import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskType } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskTransfer } from './entities/task-transfer.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

// Maps the department string used by the frontend (roleMapping.ts DEPARTMENTS) to TaskType.
function departmentToTaskType(department: string): TaskType | null {
  switch (department) {
    case 'Copy Writing':
      return TaskType.COPY;
    case 'Design':
      return TaskType.DESIGN;
    case 'Development':
      return TaskType.DEV;
    case 'AI Team':
      return TaskType.AI;
    case 'Social Media Team':
      return TaskType.SOCIAL_MEDIA;
    case 'CRM':
      return TaskType.CRM;
    case 'SEO/GEO Team':
      return TaskType.SEO_GEO;
    case 'Onboarding':
      return TaskType.INTAKE;
    default:
      return null;
  }
}

// Maps the stored TaskType back to the human-readable department label.
function taskTypeToDepartment(taskType: TaskType): string {
  switch (taskType) {
    case TaskType.COPY:
      return 'Copy Writing';
    case TaskType.DESIGN:
      return 'Design';
    case TaskType.DEV:
      return 'Development';
    case TaskType.AI:
      return 'AI Team';
    case TaskType.SOCIAL_MEDIA:
      return 'Social Media Team';
    case TaskType.CRM:
      return 'CRM';
    case TaskType.SEO_GEO:
      return 'SEO/GEO Team';
    case TaskType.INTAKE:
      return 'Onboarding';
    default:
      return taskType as string;
  }
}

// Returns the UserRole values that belong to a given department.
function rolesForDepartment(department: string): UserRole[] {
  switch (department) {
    case 'Design':
      return [UserRole.DESIGNER];
    case 'Copy Writing':
      return [UserRole.COPY_WRITING];
    case 'Development':
      return [UserRole.DEVELOPER];
    case 'AI Team':
      return [UserRole.AI_DEVELOPER];
    case 'Social Media Team':
      return [UserRole.SOCIAL_MEDIA];
    case 'CRM':
      return [UserRole.CRM];
    case 'SEO/GEO Team':
      return [UserRole.SEO_GEO];
    case 'Onboarding':
      return [UserRole.PROJECT_MANAGER, UserRole.FOUNDER_CEO];
    default:
      return [];
  }
}

// Strips "--- Column: X ---" markers and "--- Status Change ---" log blocks
// from a task description so the receiving department's board sees a clean
// "Not Yet Started" state instead of stale column routing hints.
function cleanDescription(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (!raw.trim()) return null;
  const cleaned = raw
    // Remove "--- Column: X ---" markers (with any leading newlines)
    .replace(/\n*--- Column: .+? ---/g, '')
    // Remove "--- Status Change ---" log blocks (no closing delimiter; match
    // up to the next block-start or end of string)
    .replace(/\n*--- Status Change ---[\s\S]*?(?=\n\n---|$)/g, '')
    .trim();
  return cleaned || null;
}

export interface TransferTaskPayload {
  toDepartment: string;
  kind: 'forward' | 'return';
  note?: string;
  toAssigneeIds?: string[];
}

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(TaskAssignee)
    private taskAssigneesRepository: Repository<TaskAssignee>,
    @InjectRepository(TaskTransfer)
    private transfersRepository: Repository<TaskTransfer>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  async transferTask(
    taskId: string,
    payload: TransferTaskPayload,
    requestingUserId: string,
  ): Promise<TaskTransfer> {
    const { toDepartment, kind, note, toAssigneeIds = [] } = payload;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!toDepartment || !toDepartment.trim()) {
      throw new BadRequestException('toDepartment is required');
    }
    if (kind === 'return' && (!note || !note.trim())) {
      throw new BadRequestException('Note is required when returning a task');
    }

    const task = await this.tasksRepository.findOne({
      where: { id: taskId },
      relations: ['project', 'project.pm', 'assignees'],
    });
    if (!task) throw new NotFoundException('Task not found');

    const fromDepartment = taskTypeToDepartment(task.type);

    if (toDepartment === fromDepartment) {
      throw new BadRequestException('Cannot transfer to the same department');
    }

    const receivingRoles = rolesForDepartment(toDepartment);
    if (receivingRoles.length === 0) {
      throw new BadRequestException(`Unknown department: ${toDepartment}`);
    }

    const departmentUserCount = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.role IN (:...roles)', { roles: receivingRoles })
      .andWhere('user.isActive = true')
      .getCount();

    if (departmentUserCount === 0) {
      throw new BadRequestException('No users available in the receiving department');
    }

    const newTaskType = departmentToTaskType(toDepartment);
    if (!newTaskType) {
      throw new BadRequestException(`Cannot map department "${toDepartment}" to a task type`);
    }

    // ── Transactional update ─────────────────────────────────────────────────
    const fromAssigneeIds = (task.assignees ?? []).map((a) => a.userId);

    const transfer = await this.transfersRepository.manager.transaction(async (em) => {
      // 1. Save transfer record
      const record = em.create(TaskTransfer, {
        taskId,
        fromDepartment,
        toDepartment,
        fromAssigneeIds,
        toAssigneeIds,
        transferredById: requestingUserId,
        kind,
        note: note?.trim() || null,
      });
      const saved = await em.save(TaskTransfer, record);

      // 2. Reset task: new type, clear assignee, reset to Todo, strip column markers
      await em.update(Task, taskId, {
        type: newTaskType,
        assignedToId: null,
        status: 'Todo' as any,
        isCompleted: false,
        description: cleanDescription(task.description),
      });

      // 3. Clear existing multi-assignees
      await em.delete(TaskAssignee, { taskId });

      // 4. Add toAssigneeIds if provided
      for (const userId of toAssigneeIds) {
        const assignee = em.create(TaskAssignee, { taskId, userId });
        await em.save(TaskAssignee, assignee).catch(() => {});
      }

      return saved;
    });

    // ── Notification ─────────────────────────────────────────────────────────
    const transferrer = await this.usersRepository.findOne({
      where: { id: requestingUserId },
      select: ['name'],
    });
    const transferrerName = transferrer?.name ?? 'Someone';
    const kindLabel = kind === 'return' ? 'returned' : 'forwarded';
    const notifTitle = `Task ${kindLabel}: ${task.title}`;
    const notifMessage =
      `${transferrerName} ${kindLabel} "${task.title}" from ${fromDepartment} to ${toDepartment}` +
      (note?.trim() ? ` — Note: ${note.trim()}` : '');

    const notifData = {
      type: NotificationType.TASK_TRANSFER,
      title: notifTitle,
      message: notifMessage,
      projectId: task.projectId,
      taskId,
    };

    if (task.project?.pmId) {
      this.notificationsService
        .create({ ...notifData, userId: task.project.pmId })
        .catch((err) => console.error('[TransfersService] PM notify failed:', err));
    }

    this.notificationsService
      .notifyHeadPMsAlso(notifData, task.project?.pmId ?? '')
      .catch((err) => console.error('[TransfersService] Head PM notify failed:', err));

    this.notificationsService.emitTaskTransferred({
      taskId,
      fromDepartment,
      toDepartment,
      kind,
      transferredBy: { id: requestingUserId, name: transferrerName },
      transferredAt: transfer.createdAt.toISOString(),
    });

    return transfer;
  }

  async getTransfers(taskId: string): Promise<TaskTransfer[]> {
    return this.transfersRepository.find({
      where: { taskId },
      relations: ['transferredBy'],
      order: { transferredAt: 'DESC' },
    });
  }
}
