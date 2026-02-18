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
    async create(data) {
        const notification = this.notificationsRepository.create(data);
        return this.notificationsRepository.save(notification);
    }
    async findAll(userId) {
        return this.notificationsRepository.find({
            where: { userId },
            relations: ['project', 'task'],
            order: { createdAt: 'DESC' },
        });
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
    async createTaskAssignedNotification(userId, taskId, projectId, taskTitle, projectName) {
        return this.create({
            type: notification_entity_1.NotificationType.TASK_ASSIGNED,
            title: 'New task assigned',
            message: `You have been assigned to "${taskTitle}" for ${projectName}`,
            userId,
            taskId,
            projectId,
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
            message: `${projectName} moved to ${newStage} stage`,
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
    async createTaskCompletedNotification(userId, taskId, projectId, taskTitle, projectName) {
        return this.create({
            type: notification_entity_1.NotificationType.TASK_COMPLETED,
            title: 'Task completed',
            message: `"${taskTitle}" for ${projectName} has been completed`,
            userId,
            taskId,
            projectId,
        });
    }
    async createTaskSentForReviewNotification(userId, taskId, projectId, taskTitle, projectName, hasFileUrl = false) {
        return this.create({
            type: notification_entity_1.NotificationType.REVISION_REQUESTED,
            title: 'Copy sent for review',
            message: `"${taskTitle}" for ${projectName} has been sent for review${hasFileUrl ? ' with Google Drive files attached' : ''}`,
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