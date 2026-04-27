import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Task } from '../../tasks/entities/task.entity';
export declare enum NotificationType {
    TASK_ASSIGNED = "task",
    TASK_AVAILABLE = "task_available",
    EMAIL_SENT = "email",
    PROJECT_STAGE_CHANGED = "project_stage",
    PROJECT_CREATED = "project_created",
    TASK_COMPLETED = "task_completed",
    PROJECT_ALERT = "alert",
    REVISION_REQUESTED = "revision",
    MENTION = "mention",
    TASK_UPDATE = "task_update",
    TASK_TRANSFER = "TASK_TRANSFER"
}
export declare class Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    user: User;
    userId: string;
    project: Project;
    projectId: string;
    task: Task;
    taskId: string;
    assignedToId: string;
    isRead: boolean;
    createdAt: Date;
}
