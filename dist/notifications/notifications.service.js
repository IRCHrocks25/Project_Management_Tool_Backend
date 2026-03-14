"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const resend_1 = require("resend");
const notification_entity_1 = require("./entities/notification.entity");
const user_entity_1 = require("../users/entities/user.entity");
let NotificationsService = class NotificationsService {
    constructor(notificationsRepository, usersRepository, configService) {
        this.notificationsRepository = notificationsRepository;
        this.usersRepository = usersRepository;
        this.configService = configService;
        this.resend = null;
        const apiKey = this.configService.get('RESEND_API_KEY');
        if (apiKey) {
            this.resend = new resend_1.Resend(apiKey);
        }
    }
    getDepartmentLabelFromTaskType(taskType) {
        if (!taskType)
            return null;
        const normalized = taskType.toString().toLowerCase();
        if (normalized === 'copy')
            return 'Copy Writing';
        if (normalized === 'design')
            return 'Design';
        if (normalized === 'dev' || normalized === 'development')
            return 'Development';
        if (normalized === 'ai')
            return 'AI';
        if (normalized === 'social media')
            return 'Social Media';
        if (normalized === 'crm')
            return 'CRM';
        if (normalized === 'seo/geo' || normalized === 'seo_geo' || normalized === 'seo')
            return 'SEO/GEO';
        return null;
    }
    async create(data) {
        const notification = this.notificationsRepository.create(data);
        const saved = await this.notificationsRepository.save(notification);
        this.sendNotificationEmail(data.userId, data.title, data.message, data.projectId, data.taskId).catch((err) => console.error('[NotificationsService] Failed to send notification email:', err));
        return saved;
    }
    async sendNotificationEmail(userId, title, message, projectId, taskId) {
        if (!this.resend)
            return;
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['email', 'name'],
        });
        if (!user?.email)
            return;
        const fromEmail = this.configService.get('EMAIL_FROM', 'Developer@katalyst-crm.com');
        const appName = this.configService.get('APP_NAME', 'Katalyst PM');
        const frontendUrl = this.configService.get('FRONTEND_URL', '').replace(/\/$/, '');
        let viewLink = '';
        if (frontendUrl) {
            viewLink = projectId
                ? `${frontendUrl}/project/${projectId}${taskId ? `?task=${taskId}` : ''}`
                : frontendUrl;
        }
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const safeTitle = escapeHtml(title);
        const safeMessage = escapeHtml(message);
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .container { background: #f9fafb; border-radius: 8px; padding: 30px; border: 1px solid #e5e7eb; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white !important; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>${safeTitle}</h2>
          <p>${safeMessage}</p>
          ${viewLink ? `<p><a href="${escapeHtml(viewLink)}" class="button">View in ${escapeHtml(appName)}</a></p>` : ''}
          <div class="footer">
            <p>This is an automated notification from ${escapeHtml(appName)}.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        const { error } = await this.resend.emails.send({
            from: `"${appName}" <${fromEmail}>`,
            to: user.email,
            subject: `${appName}: ${title}`,
            html,
        });
        if (error)
            throw new Error(error.message);
    }
    async notifyHeadPMsAlso(data, excludeUserId) {
        try {
            const headPMs = await this.usersRepository.find({
                where: { role: user_entity_1.UserRole.PROJECT_MANAGER, isHeadPM: true },
                select: ['id'],
            });
            for (const pm of headPMs) {
                if (pm.id === excludeUserId)
                    continue;
                await this.create({
                    ...data,
                    userId: pm.id,
                }).catch((err) => console.error(`[NotificationsService] Failed to notify Head PM ${pm.id}:`, err));
            }
        }
        catch (err) {
            console.error('[NotificationsService] notifyHeadPMsAlso error:', err);
        }
    }
    async findAll(userId, userRole) {
        console.log('[NotificationsService] findAll called with:', { userId, userRole });
        const allNotifications = await this.notificationsRepository.find({
            take: 5,
            order: { createdAt: 'DESC' }
        });
        console.log('[NotificationsService] Sample notifications in DB:', {
            totalSample: allNotifications.length,
            userIds: allNotifications.map(n => ({ id: n.id, userId: n.userId, type: n.type }))
        });
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
        if (userRole && userRole !== 'FOUNDER/CEO' && userRole !== 'Project Manager') {
            const roleToTaskTypeMap = {
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
                queryBuilder.andWhere(`(
            notification.type = :taskAvailableType OR 
            CAST(notification.type AS text) NOT IN (:...taskTypes) OR 
            task.type IS NULL OR 
            task.type = :taskType
          )`, {
                    taskType,
                    taskTypes: ['task', 'task_completed', 'revision'],
                    taskAvailableType: 'task_available'
                });
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
    async findUnreadCount(userId) {
        return this.notificationsRepository.count({
            where: { userId, isRead: false },
        });
    }
    async markAsRead(id, userId) {
        const notification = await this.notificationsRepository.findOne({
            where: { id, userId },
        });
        if (!notification) {
            return null;
        }
        notification.isRead = true;
        return this.notificationsRepository.save(notification);
    }
    async markAllAsRead(userId) {
        await this.notificationsRepository.update({ userId, isRead: false }, { isRead: true });
        return { success: true };
    }
    async deleteByTaskId(taskId) {
        await this.notificationsRepository.delete({ taskId });
    }
    async createTaskAssignedNotification(userId, taskId, projectId, taskTitle, projectName, assignedToId, taskType) {
        const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
        const data = {
            type: notification_entity_1.NotificationType.TASK_ASSIGNED,
            title: `New ${department} task assigned`,
            message: `"${taskTitle}" for ${projectName} has been assigned in ${department}.`,
            projectId,
            taskId,
            assignedToId: assignedToId || userId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
    async createEmailSentNotification(userId, projectId, projectName) {
        const data = {
            type: notification_entity_1.NotificationType.EMAIL_SENT,
            title: 'Email sent',
            message: `Email sent to client for ${projectName}`,
            projectId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
    async createProjectStageChangedNotification(userId, projectId, projectName, newStage) {
        const data = {
            type: notification_entity_1.NotificationType.PROJECT_STAGE_CHANGED,
            title: 'Project stage updated',
            message: `${projectName} moved to ${newStage} stage. Review related tasks and approvals for this project.`,
            projectId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
    async createProjectAlertNotification(userId, projectId, projectName, message) {
        const data = {
            type: notification_entity_1.NotificationType.PROJECT_ALERT,
            title: 'Project needs attention',
            message: `${projectName}: ${message}`,
            projectId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
    async createTaskCompletedNotification(userId, taskId, projectId, taskTitle, projectName, assignedToId, taskType) {
        const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
        const data = {
            type: notification_entity_1.NotificationType.TASK_COMPLETED,
            title: `${department} task completed`,
            message: `"${taskTitle}" for ${projectName} in ${department} has been completed and is ready for your review or next steps.`,
            projectId,
            taskId,
            assignedToId: assignedToId || userId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
    async createTaskSentForReviewNotification(userId, taskId, projectId, taskTitle, projectName, hasFileUrl = false, taskType) {
        let title = 'Task sent for approval';
        if (taskType === 'Copy') {
            title = 'Copy sent for approval';
        }
        else if (taskType === 'Design') {
            title = 'Design sent for approval';
        }
        const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
        const data = {
            type: notification_entity_1.NotificationType.REVISION_REQUESTED,
            title,
            message: `"${taskTitle}" for ${projectName} in ${department} has been submitted for your approval and is now under review${hasFileUrl ? ' with files attached' : ''}.`,
            projectId,
            taskId,
        };
        const result = await this.create({ ...data, userId });
        this.notifyHeadPMsAlso(data, userId).catch(() => { });
        return result;
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        config_1.ConfigService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map