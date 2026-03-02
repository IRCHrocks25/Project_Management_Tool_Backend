import { Repository } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { User } from '../users/entities/user.entity';
export declare class TasksService {
    private tasksRepository;
    private deliverablesRepository;
    private usersRepository;
    private notificationsService;
    constructor(tasksRepository: Repository<Task>, deliverablesRepository: Repository<Deliverable>, usersRepository: Repository<User>, notificationsService: NotificationsService);
    findAll(projectId?: string, assignedToId?: string, limit?: number, loadAll?: boolean): Promise<Task[]>;
    findOne(id: string): Promise<Task>;
    updateStatus(id: string, status: TaskStatus, isCompleted?: boolean, fileUrl?: string, deliverableType?: string, deliverableId?: string): Promise<Task>;
    assignTask(id: string, assignedToId: string): Promise<Task>;
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
}
