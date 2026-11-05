import { EntityManager } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { TaskActivityAction, TaskActivityLog } from './entities/task-activity-log.entity';

/**
 * Records a change inside the transaction that makes it. The inner transaction is a
 * savepoint, so if the record can't be written (say the table hasn't been migrated yet)
 * the person's own save still goes through.
 */
export const recordTaskActivity = async (
  em: EntityManager,
  entry: {
    taskId?: string | null;
    projectId?: string | null;
    action: TaskActivityAction;
    actorId?: string | null;
    details: Record<string, unknown>;
  },
): Promise<void> => {
  try {
    await em.transaction(async (savepoint) => {
      const actor = entry.actorId
        ? await savepoint.findOne(User, { where: { id: entry.actorId }, select: ['id', 'name'] })
        : null;
      await savepoint.insert(TaskActivityLog, {
        taskId: entry.taskId ?? null,
        projectId: entry.projectId ?? null,
        action: entry.action,
        actorId: entry.actorId ?? null,
        actorName: actor?.name ?? null,
        details: entry.details,
      });
    });
  } catch (error) {
    console.error(`[TaskActivity] Could not record ${entry.action} (task ${entry.taskId}, project ${entry.projectId}):`, error);
  }
};
