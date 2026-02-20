import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectTeamMember } from './entities/project-team-member.entity';
import { Task } from '../tasks/entities/task.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { DeliverableHistory } from '../deliverables/entities/deliverable-history.entity';
import { TaskFileHistory } from '../tasks/entities/task-file-history.entity';
import { User } from '../users/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectWebhookDto } from './dto/create-project-webhook.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
export declare class ProjectsService {
    private projectsRepository;
    private teamMembersRepository;
    private tasksRepository;
    private deliverablesRepository;
    private deliverableHistoryRepository;
    private taskFileHistoryRepository;
    private usersRepository;
    private notificationsService;
    private authService;
    constructor(projectsRepository: Repository<Project>, teamMembersRepository: Repository<ProjectTeamMember>, tasksRepository: Repository<Task>, deliverablesRepository: Repository<Deliverable>, deliverableHistoryRepository: Repository<DeliverableHistory>, taskFileHistoryRepository: Repository<TaskFileHistory>, usersRepository: Repository<User>, notificationsService: NotificationsService, authService: AuthService);
    create(createProjectDto: CreateProjectDto, userId: string): Promise<Project>;
    createFromWebhook(webhookDto: CreateProjectWebhookDto): Promise<Project>;
    getWebhookPM(): Promise<{
        id: string;
        name: string;
        email: string;
        role: import("../users/entities/user.entity").UserRole;
        message: string;
    }>;
    private generateDeliverables;
    private generateIntakeTasks;
    findAll(userId: string, userRole: string, includeArchived?: boolean): Promise<Project[]>;
    findOne(id: string): Promise<Project>;
    private checkAndMoveToDevelopment;
    updateStage(id: string, updateStageDto: UpdateProjectStageDto): Promise<Project>;
    private generateCopyTasks;
    updateLastEmailed(id: string): Promise<Project>;
    generateOnboardingTasks(id: string): Promise<{
        message: string;
        tasks: Task[];
    }>;
    closeProject(id: string): Promise<Project>;
    archiveProject(id: string, userId?: string): Promise<Project>;
    completeProject(id: string, userId?: string): Promise<Project>;
    getCompletedProjects(userId: string, userRole: string): Promise<Project[]>;
    getStats(userId: string, userRole: string): Promise<{
        total: number;
        byStage: any[];
        overdue: number;
    }>;
    addTeamMember(projectId: string, userId: string): Promise<ProjectTeamMember>;
    removeTeamMember(projectId: string, userId: string): Promise<{
        success: boolean;
    }>;
    getTeamMembers(projectId: string): Promise<{
        id: string;
        userId: string;
        user: User;
        assignedAt: Date;
    }[]>;
    getActivity(projectId: string): Promise<any[]>;
    private getDepartmentFromDeliverableType;
    private getDepartmentFromTaskType;
}
