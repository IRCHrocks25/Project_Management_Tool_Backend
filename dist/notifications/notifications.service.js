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
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const notification_entity_1 = require("./entities/notification.entity");
let NotificationsService = class NotificationsService {
    constructor(notificationsRepository) {
        this.notificationsRepository = notificationsRepository;
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
        return this.notificationsRepository.save(notification);
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
        return this.create({
            type: notification_entity_1.NotificationType.TASK_ASSIGNED,
            title: `New ${department} task assigned`,
            message: `"${taskTitle}" for ${projectName} has been assigned in ${department}.`,
            userId,
            taskId,
            projectId,
            assignedToId: assignedToId || userId,
        });
    }
    async createEmailSentNotification(userId, projectId, projectName) {
        return this.create({
            type: notification_entity_1.NotificationType.EMAIL_SENT,
            title: 'Email sent',
            message: `Email sent to client for ${projectName}`,
            userId,
            projectId,
        });
    }
    async createProjectStageChangedNotification(userId, projectId, projectName, newStage) {
        return this.create({
            type: notification_entity_1.NotificationType.PROJECT_STAGE_CHANGED,
            title: 'Project stage updated',
            message: `${projectName} moved to ${newStage} stage. Review related tasks and approvals for this project.`,
            userId,
            projectId,
        });
    }
    async createProjectAlertNotification(userId, projectId, projectName, message) {
        return this.create({
            type: notification_entity_1.NotificationType.PROJECT_ALERT,
            title: 'Project needs attention',
            message: `${projectName}: ${message}`,
            userId,
            projectId,
        });
    }
    async createTaskCompletedNotification(userId, taskId, projectId, taskTitle, projectName, assignedToId, taskType) {
        const department = this.getDepartmentLabelFromTaskType(taskType) || 'Department';
        return this.create({
            type: notification_entity_1.NotificationType.TASK_COMPLETED,
            title: `${department} task completed`,
            message: `"${taskTitle}" for ${projectName} in ${department} has been completed and is ready for your review or next steps.`,
            userId,
            taskId,
            projectId,
            assignedToId: assignedToId || userId,
        });
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
        return this.create({
            type: notification_entity_1.NotificationType.REVISION_REQUESTED,
            title,
            message: `"${taskTitle}" for ${projectName} in ${department} has been submitted for your approval and is now under review${hasFileUrl ? ' with files attached' : ''}.`,
            userId,
            taskId,
            projectId,
        });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map