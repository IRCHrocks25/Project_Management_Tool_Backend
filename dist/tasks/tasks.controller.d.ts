import 'multer';
import { TasksService } from './tasks.service';
import { AttachmentsService } from './attachments.service';
import { TransfersService, TransferTaskPayload } from './transfers.service';
import { TaskStatus } from './entities/task.entity';
import { CreateTaskQuestionDto } from './dto/create-task-question.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
export declare class TasksController {
    private readonly tasksService;
    private readonly attachmentsService;
    private readonly transfersService;
    constructor(tasksService: TasksService, attachmentsService: AttachmentsService, transfersService: TransfersService);
    findAll(projectId?: string, assignedToId?: string, limit?: string, all?: string, taskType?: string): Promise<import("./entities/task.entity").Task[]>;
    getAllConversations(): Promise<any[]>;
    deleteQuestion(questionId: string): Promise<void>;
    getConversations(id: string): Promise<import("./entities/task-question.entity").TaskQuestion[]>;
    createQuestion(id: string, createDto: CreateTaskQuestionDto, req: any): Promise<import("./entities/task-question.entity").TaskQuestion>;
    getAttachments(taskId: string): Promise<import("./entities/task-attachment.entity").TaskAttachment[]>;
    addAttachmentLink(taskId: string, body: {
        url: string;
        label?: string;
    }, req: any): Promise<import("./entities/task-attachment.entity").TaskAttachment>;
    uploadAttachments(taskId: string, files: Express.Multer.File[], req: any): Promise<import("./entities/task-attachment.entity").TaskAttachment[]>;
    deleteAttachment(attachmentId: string, req: any): Promise<{
        success: boolean;
    }>;
    transferTask(id: string, body: TransferTaskPayload, req: any): Promise<import("./entities/task-transfer.entity").TaskTransfer>;
    getTransfers(id: string): Promise<import("./entities/task-transfer.entity").TaskTransfer[]>;
    findOne(id: string): Promise<{
        attachments: import("./entities/task-attachment.entity").TaskAttachment[];
        id: string;
        title: string;
        description: string;
        project: import("../projects/entities/project.entity").Project;
        projectId: string;
        assignedTo: import("../users/entities/user.entity").User;
        assignedToId: string;
        assignees: import("./entities/task-assignee.entity").TaskAssignee[];
        status: TaskStatus;
        type: import("./entities/task.entity").TaskType;
        dueDate: Date;
        isCompleted: boolean;
        fileUrl: string;
        submissionData: string;
        submissionType: string;
        deliverableId: string;
        isArchived: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    create(createTaskDto: any): Promise<import("./entities/task.entity").Task>;
    updateStatus(id: string, body: {
        status: TaskStatus;
        isCompleted?: boolean;
        fileUrl?: string;
        deliverableType?: string;
        deliverableId?: string;
    }): Promise<import("./entities/task.entity").Task>;
    assignTask(id: string, body: {
        assignedToId?: string;
        userIds?: string[];
    }): Promise<import("./entities/task.entity").Task>;
    submitOnboardingData(id: string, body: {
        submissionData: string;
        submissionType: 'url' | 'text';
    }): Promise<import("./entities/task.entity").Task>;
    update(id: string, updateTaskDto: {
        title?: string;
        description?: string;
        dueDate?: Date;
        deliverableId?: string;
    }): Promise<import("./entities/task.entity").Task>;
    remove(id: string): Promise<{
        message: string;
    }>;
    createComment(questionId: string, createDto: CreateTaskCommentDto, req: any): Promise<import("./entities/task-comment.entity").TaskComment>;
}
