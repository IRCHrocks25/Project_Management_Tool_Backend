import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectWebhookDto } from './dto/create-project-webhook.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UserRole } from '../users/entities/user.entity';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createProjectDto: CreateProjectDto, req: any): Promise<import("./entities/project.entity").Project>;
    createFromWebhook(webhookDto: CreateProjectWebhookDto): Promise<import("./entities/project.entity").Project>;
    getWebhookPM(): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        message: string;
    }>;
    findAll(req: any, includeArchived?: string): Promise<import("./entities/project.entity").Project[]>;
    getStats(req: any): Promise<{
        total: number;
        byStage: any[];
        overdue: number;
    }>;
    getActivity(id: string): Promise<any[]>;
    updateStage(id: string, updateStageDto: UpdateProjectStageDto): Promise<import("./entities/project.entity").Project>;
    closeProject(id: string): Promise<import("./entities/project.entity").Project>;
    archiveProject(id: string, req: any): Promise<import("./entities/project.entity").Project>;
    completeProject(id: string, req: any): Promise<import("./entities/project.entity").Project>;
    getCompletedProjects(req: any): Promise<import("./entities/project.entity").Project[]>;
    findOne(id: string): Promise<import("./entities/project.entity").Project>;
    generateOnboardingTasks(id: string): Promise<{
        message: string;
        tasks: import("../tasks/entities/task.entity").Task[];
    }>;
    addTeamMember(projectId: string, body: {
        userId: string;
    }): Promise<import("./entities/project-team-member.entity").ProjectTeamMember>;
    getTeamMembers(projectId: string): Promise<{
        id: string;
        userId: string;
        user: import("../users/entities/user.entity").User;
        assignedAt: Date;
    }[]>;
    removeTeamMember(projectId: string, userId: string): Promise<{
        success: boolean;
    }>;
    update(id: string, updateProjectDto: UpdateProjectDto): Promise<import("./entities/project.entity").Project>;
}
