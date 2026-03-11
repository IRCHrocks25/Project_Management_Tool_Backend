import { TasksService } from './tasks.service';
import { TaskStatus } from './entities/task.entity';
import { CreateTaskQuestionDto } from './dto/create-task-question.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    findAll(projectId?: string, assignedToId?: string, limit?: string, all?: string): Promise<import("./entities/task.entity").Task[]>;
    getAllConversations(): Promise<any[]>;
    getConversations(id: string): Promise<import("./entities/task-question.entity").TaskQuestion[]>;
    createQuestion(id: string, createDto: CreateTaskQuestionDto, req: any): Promise<import("./entities/task-question.entity").TaskQuestion>;
    findOne(id: string): Promise<import("./entities/task.entity").Task>;
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
