import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { TaskAssignee } from './task-assignee.entity';
import { TaskDueDateMove } from './task-due-date-move.entity';
export declare enum TaskStatus {
    TODO = "Todo",
    IN_PROGRESS = "In Progress",
    IN_REVIEW = "In Review",
    COMPLETED = "Completed",
    BLOCKED = "Blocked"
}
export declare enum TaskType {
    INTAKE = "Onboarding",
    COPY = "Copy",
    DESIGN = "Design",
    DEV = "Dev",
    AI = "AI",
    SOCIAL_MEDIA = "Social Media",
    CRM = "CRM",
    SEO_GEO = "SEO/GEO",
    GENERAL = "General"
}
export declare class Task {
    id: string;
    title: string;
    description: string;
    project: Project;
    projectId: string;
    assignedTo: User;
    assignedToId: string;
    assignees: TaskAssignee[];
    status: TaskStatus;
    type: TaskType;
    dueDate: Date;
    movedDueDate: Date;
    movedDueDateComment: string;
    movedDueDateUpdatedAt: Date;
    movedDueDateUpdatedById: string;
    movedDueDateUpdatedBy: User;
    isCompleted: boolean;
    fileUrl: string;
    submissionData: string;
    submissionType: string;
    deliverableId: string;
    isArchived: boolean;
    dueDateMoves: TaskDueDateMove[];
    createdAt: Date;
    updatedAt: Date;
}
