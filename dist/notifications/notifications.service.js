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
const notification_entity_1 = require("./entities/notification.entity");
const user_entity_1 = require("../users/entities/user.entity");
const notifications_gateway_1 = require("./notifications.gateway");
let NotificationsService = class NotificationsService {
    constructor(notificationsRepository, usersRepository, configService, notificationsGateway) {
        this.notificationsRepository = notificationsRepository;
        this.usersRepository = usersRepository;
        this.configService = configService;
        this.notificationsGateway = notificationsGateway;
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
        this.sendNotificationEmail(data.userId, data.title, data.message, data.projectId, data.taskId, data.type).catch((err) => console.error('[NotificationsService] Failed to send notification email:', err));
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
                createdAt: saved.createdAt instanceof Date ? saved.createdAt.toISOString() : saved.createdAt,
            };
            this.notificationsGateway.emitNewNotification(data.userId, payload);
        }
        catch (err) {
            console.error('[NotificationsService] Failed to emit new_notification:', err);
        }
        return saved;
    }
    async sendNotificationEmail(userId, title, message, projectId, taskId, notificationType) {
        const webhookUrl = this.configService.get('NOTIFICATION_WEBHOOK_URL') ||
            'https://katalyst-crm2.fly.dev/webhook/60052967-5dd2-44f1-b81d-771c99f6e133';
        if (!webhookUrl)
            return;
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            select: ['email', 'name'],
        });
        if (!user?.email)
            return;
        const appName = this.configService.get('APP_NAME', 'Katalyst PM');
        const frontendUrl = this.configService.get('FRONTEND_URL', '').replace(/\/$/, '');
        let viewLink = '';
        if (frontendUrl) {
            viewLink = projectId
                ? `${frontendUrl}/project/${projectId}${taskId ? `?task=${taskId}` : ''}`
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
    async sendNotificationViaWebhook(payload) {
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
            const webhookToken = this.configService.get('WEBHOOK_TOKEN', 'katalystPM2026');
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
        }
        catch (err) {
            console.error('[NotificationsService] Notification webhook error:', err);
        }
    }
    async sendTestWebhook(email, userName) {
        const webhookUrl = this.configService.get('NOTIFICATION_WEBHOOK_URL') ||
            'https://katalyst-crm2.fly.dev/webhook/60052967-5dd2-44f1-b81d-771c99f6e133';
        if (!webhookUrl) {
            return { success: false, message: 'NOTIFICATION_WEBHOOK_URL is not configured' };
        }
        const appName = this.configService.get('APP_NAME', 'Katalyst PM');
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
            const webhookToken = this.configService.get('WEBHOOK_TOKEN', 'katalystPM2026');
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
        }
        catch (err) {
            console.error('[NotificationsService] Test webhook error:', err);
            return { success: false, message: err?.message || 'Request failed' };
        }
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
        config_1.ConfigService,
        notifications_gateway_1.NotificationsGateway])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map