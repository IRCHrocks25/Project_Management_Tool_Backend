import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
  ) {}

  async create(data: {
    type: NotificationType;
    title: string;
    message: string;
    userId: string;
    projectId?: string;
    taskId?: string;
    assignedToId?: string; // For task notifications
  }) {
    const notification = this.notificationsRepository.create(data);
    return this.notificationsRepository.save(notification);
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
        queryBuilder.andWhere(
          '(task.type = :taskType OR task.type IS NULL OR notification.type NOT IN (:taskTypes))',
          { 
            taskType,
            taskTypes: ['task', 'task_completed', 'revision']
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

  // Helper methods to create specific notification types
  async createTaskAssignedNotification(
    userId: string,
    taskId: string,
    projectId: string,
    taskTitle: string,
    projectName: string,
    assignedToId?: string, // The user assigned to the task (usually same as userId, but included for clarity)
  ) {
    return this.create({
      type: NotificationType.TASK_ASSIGNED,
      title: 'New task assigned',
      message: `You have been assigned to "${taskTitle}" for ${projectName}`,
      userId,
      taskId,
      projectId,
      assignedToId: assignedToId || userId, // Use provided assignedToId or fallback to userId
    });
  }

  async createEmailSentNotification(
    userId: string,
    projectId: string,
    projectName: string,
  ) {
    return this.create({
      type: NotificationType.EMAIL_SENT,
      title: 'Email sent',
      message: `Email sent to client for ${projectName}`,
      userId,
      projectId,
    });
  }

  async createProjectStageChangedNotification(
    userId: string,
    projectId: string,
    projectName: string,
    newStage: string,
  ) {
    return this.create({
      type: NotificationType.PROJECT_STAGE_CHANGED,
      title: 'Project stage updated',
      message: `${projectName} moved to ${newStage} stage`,
      userId,
      projectId,
    });
  }

  async createProjectAlertNotification(
    userId: string,
    projectId: string,
    projectName: string,
    message: string,
  ) {
    return this.create({
      type: NotificationType.PROJECT_ALERT,
      title: 'Project needs attention',
      message: `${projectName}: ${message}`,
      userId,
      projectId,
    });
  }

  async createTaskCompletedNotification(
    userId: string,
    taskId: string,
    projectId: string,
    taskTitle: string,
    projectName: string,
    assignedToId?: string, // The user who completed the task
  ) {
    return this.create({
      type: NotificationType.TASK_COMPLETED,
      title: 'Task completed',
      message: `"${taskTitle}" for ${projectName} has been completed`,
      userId,
      taskId,
      projectId,
      assignedToId: assignedToId || userId,
    });
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
    // Determine notification title based on task type
    let title = 'Task sent for review';
    if (taskType === 'Copy') {
      title = 'Copy sent for review';
    } else if (taskType === 'Design') {
      title = 'Design sent for review';
    }
    
    return this.create({
      type: NotificationType.REVISION_REQUESTED,
      title,
      message: `"${taskTitle}" for ${projectName} has been sent for review${hasFileUrl ? ' with Google Drive files attached' : ''}`,
      userId, // Only PM receives this notification
      taskId,
      projectId,
    });
  }
}

