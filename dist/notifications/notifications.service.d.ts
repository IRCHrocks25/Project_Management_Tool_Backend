import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
export declare class NotificationsService {
    private notificationsRepository;
    constructor(notificationsRepository: Repository<Notification>);
    create(data: {
        type: NotificationType;
        title: string;
        message: string;
        userId: string;
        projectId?: string;
        taskId?: string;
    }): Promise<Notification>;
    findAll(userId: string): Promise<Notification[]>;
    findUnreadCount(userId: string): Promise<number>;
    markAsRead(id: string, userId: string): Promise<Notification>;
    markAllAsRead(userId: string): Promise<{
        success: boolean;
    }>;
    createTaskAssignedNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string): Promise<Notification>;
    createEmailSentNotification(userId: string, projectId: string, projectName: string): Promise<Notification>;
    createProjectStageChangedNotification(userId: string, projectId: string, projectName: string, newStage: string): Promise<Notification>;
    createProjectAlertNotification(userId: string, projectId: string, projectName: string, message: string): Promise<Notification>;
    createTaskCompletedNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string): Promise<Notification>;
    createTaskSentForReviewNotification(userId: string, taskId: string, projectId: string, taskTitle: string, projectName: string, hasFileUrl?: boolean): Promise<Notification>;
}
