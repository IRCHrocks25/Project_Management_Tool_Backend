import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
    private notificationsGateway: NotificationsGateway,
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

  /**
   * FRONTEND_URL can sometimes be provided as a comma/newline separated list.
   * We pick the first valid http(s) URL to avoid malformed email links.
   */
  private normalizeFrontendUrl(rawUrl?: string): string {
    if (!rawUrl) return '';
    const candidates = rawUrl
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.toString().replace(/\/$/, '');
        }
      } catch {
        // Skip invalid candidates.
      }
    }

    return '';
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
    const saved = await this.notificationsRepository.save(notification);
    // Send email via webhook (n8n); fire-and-forget
    this.sendNotificationEmail(
      data.userId,
      data.title,
      data.message,
      data.projectId,
      data.taskId,
      data.type,
    ).catch((err) => console.error('[NotificationsService] Failed to send notification email:', err));
    // Emit real-time event so the recipient's UI updates without refresh
    try {
      const payload = {
        id: saved.id,
        type: saved.type,
        title: saved.title,
        message: saved.message,
        projectId: saved.projectId ?? undefined,
        taskId: saved.taskId ?? undefined,
        userId: saved.userId,
        assignedToId: saved.assignedToId ?? undefined,
        isRead: saved.isRead,
        createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : (saved.createdAt as string),
      };
      this.notificationsGateway.emitNewNotification(data.userId, payload);
    } catch (err) {
      console.error('[NotificationsService] Failed to emit new_notification:', err);
    }
    return saved;
  }

  /**
   * Send notification email via n8n webhook when NOTIFICATION_WEBHOOK_URL is set.
   * If the URL is not set, no email is sent (in-app notification only).
   */
  private async sendNotificationEmail(
    userId: string,
    title: string,
    message: string,
    projectId?: string,
    taskId?: string,
    notificationType?: NotificationType,
  ): Promise<void> {
    const webhookUrl =
      this.configService.get<string>('NOTIFICATION_WEBHOOK_URL') ||
      'https://katalyst-crm2.fly.dev/webhook/60052967-5dd2-44f1-b81d-771c99f6e133';
    if (!webhookUrl) return;

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['email', 'name'],
    });
    if (!user?.email) return;

    const appName = this.configService.get<string>('APP_NAME', 'Katalyst PM');
    const frontendUrl = this.normalizeFrontendUrl(this.configService.get<string>('FRONTEND_URL', ''));
    let viewLink = '';
    if (frontendUrl) {
      viewLink = projectId
        ? `${frontendUrl}/project/${projectId}${taskId ? `?task=${taskId}&tab=details` : ''}`
        : frontendUrl;
    }

    await this.sendNotificationViaWebhook({
      webhookUrl,
      to: user.email,
      userName: user.name ?? undefined,
      notificationType: notificationType ?? null,
      title,
      message,
      viewLink: viewLink || undefined,
      projectId,
      taskId,
      appName,
    });
  }

  /**
   * POST notification payload to n8n webhook so n8n can send the email.
   * Fire-and-forget; errors are logged only.
   */
  private async sendNotificationViaWebhook(payload: {
    webhookUrl: string;
    to: string;
    userName?: string;
    notificationType: NotificationType | null;
    title: string;
    message: string;
    viewLink?: string;
    projectId?: string;
    taskId?: string;
    appName: string;
  }): Promise<void> {
    const { webhookUrl, ...body } = payload;
    const requestBody = JSON.stringify({
      to: body.to,
      userName: body.userName ?? null,
      notification_type: body.notificationType ?? 'task_update',
      title: body.title,
      message: body.message,
      view_link: body.viewLink ?? null,
      project_id: body.projectId ?? null,
      task_id: body.taskId ?? null,
      app_name: body.appName,
      created_at: new Date().toISOString(),
    });
    try {
      const webhookToken = this.configService.get<string>('WEBHOOK_TOKEN', 'katalystPM2026');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Webhook-Token': webhookToken,
        },
        body: requestBody,
      });
      if (!response.ok) {
        console.error('[NotificationsService] Notification webhook failed:', response.status, await response.text());
      }
    } catch (err) {
      console.error('[NotificationsService] Notification webhook error:', err);
    }
  }

  /**
   * Send a test notification payload to the webhook (for dashboard "Test webhook" button).
   * Uses NOTIFICATION_WEBHOOK_URL and Webhook-Token: katalystPM2026.
   */
  async sendTestWebhook(email: string, userName?: string): Promise<{ success: boolean; message?: string }> {
    const webhookUrl =
      this.configService.get<string>('NOTIFICATION_WEBHOOK_URL') ||
      'https://katalyst-crm2.fly.dev/webhook/60052967-5dd2-44f1-b81d-771c99f6e133';
    if (!webhookUrl) {
      return { success: false, message: 'NOTIFICATION_WEBHOOK_URL is not configured' };
    }
    const appName = this.configService.get<string>('APP_NAME', 'Katalyst PM');
    const requestBody = JSON.stringify({
      to: email,
      userName: userName ?? null,
      notification_type: 'task_update',
      title: 'Test notification',
      message: 'This is a test from the dashboard. If you received this email, the webhook is working.',
      view_link: null,
      project_id: null,
      task_id: null,
      app_name: appName,
      created_at: new Date().toISOString(),
    });
    try {
      const webhookToken = this.configService.get<string>('WEBHOOK_TOKEN', 'katalystPM2026');
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Webhook-Token': webhookToken,
        },
        body: requestBody,
      });
      if (!response.ok) {
        const text = await response.text();
        console.error('[NotificationsService] Test webhook failed:', response.status, text);
        return { success: false, message: `Webhook returned ${response.status}: ${text}` };
      }
      return { success: true, message: 'Test notification sent to webhook' };
    } catch (err: any) {
      console.error('[NotificationsService] Test webhook error:', err);
      return { success: false, message: err?.message || 'Request failed' };
    }
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

