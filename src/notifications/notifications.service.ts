import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /**
   * Helper to convert a task type into a human‑readable department label.
   * This is used to make PM notifications more informative.
   */
  private getDepartmentLabelFromTaskType(taskType?: string): string | null {
    if (!taskType) return null;
    const normalized = taskType.toString().toLowerCase();

    if (normalized === 'copy') return 'Copy Writing';
    if (normalized === 'design') return 'Design';
    if (normalized === 'dev' || normalized === 'development') return 'Development';
    if (normalized === 'ai') return 'AI';
    if (normalized === 'social media') return 'Social Media';
    if (normalized === 'crm') return 'CRM';
    if (normalized === 'seo/geo' || normalized === 'seo_geo' || normalized === 'seo') return 'SEO/GEO';

    return null;
  }

  async create(data: {
    type: NotificationType;
    title: string;
    message: string;
    userId: string;
    projectId?: string;
    taskId?: string;
    assignedToId?: string;
  }) {
    const notification = this.notificationsRepository.create(data);
    return this.notificationsRepository.save(notification);
  }

  /**
   * Also create this notification for all Head PMs (birds-eye view).
   * Call after create() for PM-level or cross-department notifications.
   */
  async notifyHeadPMsAlso(
    data: {
      type: NotificationType;
      title: string;
      message: string;
      projectId?: string;
      taskId?: string;
      assignedToId?: string;
    },
    excludeUserId: string,
  ) {
    try {
      const headPMs = await this.usersRepository.find({
        where: { role: UserRole.PROJECT_MANAGER, isHeadPM: true },
        select: ['id'],
      });
      for (const pm of headPMs) {
        if (pm.id === excludeUserId) continue;
        await this.create({
          ...data,
          userId: pm.id,
        }).catch((err) =>
          console.error(`[NotificationsService] Failed to notify Head PM ${pm.id}:`, err),
        );
      }
    } catch (err) {
      console.error('[NotificationsService] notifyHeadPMsAlso error:', err);
    }
  }

  async findAll(userId: string, userRole?: string) {
    console.log('[NotificationsService] findAll called with:', { userId, userRole });
    
    // Debug: Check all notifications to see their userId values
    const allNotifications = await this.notificationsRepository.find({
      take: 5,
      order: { createdAt: 'DESC' }
    });
    console.log('[NotificationsService] Sample notifications in DB:', {
      totalSample: allNotifications.length,
      userIds: allNotifications.map(n => ({ id: n.id, userId: n.userId, type: n.type }))
    });
    
    // Check what notifications exist for this specific user
    const userNotifications = await this.notificationsRepository.find({
      where: { userId },
      take: 5
    });
    console.log('[NotificationsService] Notifications for current user:', {
      userId,
      count: userNotifications.length,
      sample: userNotifications[0]
    });
    
    const queryBuilder = this.notificationsRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.project', 'project')
      .leftJoinAndSelect('notification.task', 'task')
      .where('notification.userId = :userId', { userId });

    // Filter by role/department - only show notifications relevant to user's department
    if (userRole && userRole !== 'FOUNDER/CEO' && userRole !== 'Project Manager') {
      // For role-specific users, only show notifications for their task type
      const roleToTaskTypeMap: Record<string, string> = {
        'Copy Writing': 'Copy',
        'Designer': 'Design',
        'Developer': 'Dev',
        'AI Developer': 'AI',
        'Social Media': 'Social Media',
        'CRM': 'CRM',
        'SEO/GEO': 'SEO/GEO',
      };

      const taskType = roleToTaskTypeMap[userRole];
      if (taskType) {
        // Only show task-related notifications if they match the user's department
        // Show all non-task notifications (project updates, emails, etc.)
        // TASK_AVAILABLE notifications are always shown (they're already filtered by userId and department at creation time)
        // TASK_ASSIGNED notifications are shown if task.type matches the user's department
        // Note: Cast enum to text for NOT IN comparison (PostgreSQL doesn't allow direct enum array comparison)
        queryBuilder.andWhere(
          `(
            notification.type = :taskAvailableType OR 
            CAST(notification.type AS text) NOT IN (:...taskTypes) OR 
            task.type IS NULL OR 
            task.type = :taskType
          )`,
          { 
            taskType,
            taskTypes: ['task', 'task_completed', 'revision'],
            taskAvailableType: 'task_available' // Always include TASK_AVAILABLE notifications
          }
        );
      }
    }

    const result = await queryBuilder.orderBy('notification.createdAt', 'DESC').getMany();
    console.log('[NotificationsService] Query result:', {
      userId,
      count: result.length,
      sample: result[0]
    });
    return result;
  }

  async findUnreadCount(userId: string) {
    return this.notificationsRepository.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationsRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      return null;
    }

    notification.isRead = true;
    return this.notificationsRepository.save(notification);
  }

  async markAllAsRead(userId: string) {
    await this.notificationsRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { success: true };
  }

  async deleteByTaskId(taskId: string) {
    await this.notificationsRepository.delete({ taskId });
  }

  // Helper methods to create specific notification types
  async createTaskAssignedNotification(
    userId: string,
    taskId: string,
    projectId: string,
    taskTitle: string,
    projectName: string,
    assignedToId?: string,
    taskType?: string,
  ) {
    const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
    const data = {
      type: NotificationType.TASK_ASSIGNED,
      title: `New ${department} task assigned`,
      message: `"${taskTitle}" for ${projectName} has been assigned in ${department}.`,
      projectId,
      taskId,
      assignedToId: assignedToId || userId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }

  async createEmailSentNotification(
    userId: string,
    projectId: string,
    projectName: string,
  ) {
    const data = {
      type: NotificationType.EMAIL_SENT,
      title: 'Email sent',
      message: `Email sent to client for ${projectName}`,
      projectId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }

  async createProjectStageChangedNotification(
    userId: string,
    projectId: string,
    projectName: string,
    newStage: string,
  ) {
    const data = {
      type: NotificationType.PROJECT_STAGE_CHANGED,
      title: 'Project stage updated',
      message: `${projectName} moved to ${newStage} stage. Review related tasks and approvals for this project.`,
      projectId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }

  async createProjectAlertNotification(
    userId: string,
    projectId: string,
    projectName: string,
    message: string,
  ) {
    const data = {
      type: NotificationType.PROJECT_ALERT,
      title: 'Project needs attention',
      message: `${projectName}: ${message}`,
      projectId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }

  async createTaskCompletedNotification(
    userId: string,
    taskId: string,
    projectId: string,
    taskTitle: string,
    projectName: string,
    assignedToId?: string,
    taskType?: string,
  ) {
    const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
    const data = {
      type: NotificationType.TASK_COMPLETED,
      title: `${department} task completed`,
      message: `"${taskTitle}" for ${projectName} in ${department} has been completed and is ready for your review or next steps.`,
      projectId,
      taskId,
      assignedToId: assignedToId || userId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }

  async createTaskSentForReviewNotification(
    userId: string,
    taskId: string,
    projectId: string,
    taskTitle: string,
    projectName: string,
    hasFileUrl: boolean = false,
    taskType?: string,
  ) {
    let title = 'Task sent for approval';
    if (taskType === 'Copy') {
      title = 'Copy sent for approval';
    } else if (taskType === 'Design') {
      title = 'Design sent for approval';
    }
    const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
    const data = {
      type: NotificationType.REVISION_REQUESTED,
      title,
      message: `"${taskTitle}" for ${projectName} in ${department} has been submitted for your approval and is now under review${hasFileUrl ? ' with files attached' : ''}.`,
      projectId,
      taskId,
    };
    const result = await this.create({ ...data, userId });
    this.notifyHeadPMsAlso(data, userId).catch(() => {});
    return result;
  }
}

