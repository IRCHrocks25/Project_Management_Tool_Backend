import { Task } from './task.entity';
import { User } from '../../users/entities/user.entity';
export declare enum FileAction {
    APPROVED = "Approved",
    REVISION_REQUESTED = "Revision Requested",
    SUBMITTED = "Submitted"
}
export declare class TaskFileHistory {
    id: string;
    task: Task;
    taskId: string;
    fileUrl: string;
    user: User;
    userId: string;
    action: FileAction;
    notes: string;
    createdAt: Date;
}
