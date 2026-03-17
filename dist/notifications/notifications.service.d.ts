import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsGateway } from './notifications.gateway';
export declare class NotificationsService {
    private notificationsRepository;
    private usersRepository;
    private configService;
    private notificationsGateway;
    constructor(notificationsRepository: Repository<Notification>, usersRepository: Repository<User>, configService: ConfigService, notificationsGateway: NotificationsGateway);
    private getDepartmentLabelFromTaskType;
    create(data: {
        type: NotificationType;
        title: string;
        message: string;
        userId: string;
        projectId?: string;
        taskId?: string;
        assignedToId?: string;
    }): Promise<Notification>;
    private sendNotificationEmail;
    private sendNotificationViaWebhook;
    sendTestWebhook(email: string, userName?: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    notifyHeadPMsAlso(data: {
        type: NotificationType;
        title: string;
        message: string;
        projectId?: string;
        taskId?: string;
        assignedToId?: string;
    }, excludeUserId: string): Promise<void>;
    findAll(userId: string, userRole?: string): Promise<Notification[]>;
    findUnreadCount(userId: string): Promise<number>;
    markAsRead(id: string, userId: string): Promise<Notification>;
    markAllAsRead(userId: string): Promise<{
        success: boolean;
    }>;
    deleteByTaskId(taskId: string): Promise<void>;
    createTaskAssignedNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string, assignedToId?: string, taskType?: string): Promise<Notification>;
    createEmailSentNotification(userId: string, projectId: string, projectName: string): Promise<Notification>;
    createProjectStageChangedNotification(userId: string, projectId: string, projectName: string, newStage: string): Promise<Notification>;
    createProjectAlertNotification(userId: string, projectId: string, projectName: string, message: string): Promise<Notification>;
    createTaskCompletedNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string, assignedToId?: string, taskType?: string): Promise<Notification>;
    createTaskSentForReviewNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string, hasFileUrl?: boolean, taskType?: string): Promise<Notification>;
}
