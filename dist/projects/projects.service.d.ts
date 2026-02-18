import { Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectTeamMember } from './entities/project-team-member.entity';
import { Task } from '../tasks/entities/task.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { NotificationsService } from '../notifications/notifications.service';
export declare class ProjectsService {
    private projectsRepository;
    private teamMembersRepository;
    private tasksRepository;
    private deliverablesRepository;
    private notificationsService;
    constructor(projectsRepository: Repository<Project>, teamMembersRepository: Repository<ProjectTeamMember>, tasksRepository: Repository<Task>, deliverablesRepository: Repository<Deliverable>, notificationsService: NotificationsService);
    create(createProjectDto: CreateProjectDto, userId: string): Promise<Project>;
    private generateDeliverables;
    private generateIntakeTasks;
    findAll(userId: string, userRole: string): Promise<Project[]>;
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
        user: import("../users/entities/user.entity").User;
        assignedAt: Date;
    }[]>;
}
