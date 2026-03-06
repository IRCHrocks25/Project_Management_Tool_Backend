import { Repository } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskQuestion } from './entities/task-question.entity';
import { TaskComment } from './entities/task-comment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { User } from '../users/entities/user.entity';
import { CreateTaskQuestionDto } from './dto/create-task-question.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
export declare class TasksService {
    private tasksRepository;
    private taskAssigneesRepository;
    private taskQuestionsRepository;
    private taskCommentsRepository;
    private deliverablesRepository;
    private usersRepository;
    private notificationsService;
    constructor(tasksRepository: Repository<Task>, taskAssigneesRepository: Repository<TaskAssignee>, taskQuestionsRepository: Repository<TaskQuestion>, taskCommentsRepository: Repository<TaskComment>, deliverablesRepository: Repository<Deliverable>, usersRepository: Repository<User>, notificationsService: NotificationsService);
    findAll(projectId?: string, assignedToId?: string, limit?: number, loadAll?: boolean): Promise<Task[]>;
    findOne(id: string): Promise<Task>;
    updateStatus(id: string, status: TaskStatus, isCompleted?: boolean, fileUrl?: string, deliverableType?: string, deliverableId?: string): Promise<Task>;
    assignTask(id: string, assignedToId: string): Promise<Task>;
    assignTaskToMultiple(id: string, userIds: string[]): Promise<Task>;
    create(createTaskDto: any): Promise<Task>;
    submitOnboardingData(id: string, submissionData: string, submissionType: 'url' | 'text'): Promise<Task>;
    update(id: string, updateTaskDto: {
        title?: string;
        description?: string;
        dueDate?: Date;
        deliverableId?: string;
    }): Promise<Task>;
    remove(id: string): Promise<{
        message: string;
    }>;
    createQuestion(taskId: string, createDto: CreateTaskQuestionDto, userId: string): Promise<TaskQuestion>;
    createComment(questionId: string, createDto: CreateTaskCommentDto, userId: string): Promise<TaskComment>;
    getConversations(taskId: string): Promise<TaskQuestion[]>;
}
