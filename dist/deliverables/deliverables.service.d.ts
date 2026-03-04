import { Repository } from 'typeorm';
import { Deliverable, DeliverableStatus, DeliverableType } from './entities/deliverable.entity';
import { DeliverableTeamMember } from './entities/deliverable-team-member.entity';
import { DeliverableHistory } from './entities/deliverable-history.entity';
import { Task } from '../tasks/entities/task.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
export declare class DeliverablesService {
    private deliverablesRepository;
    private deliverableTeamMembersRepository;
    private historyRepository;
    private tasksRepository;
    private projectsRepository;
    private usersRepository;
    private notificationsService;
    constructor(deliverablesRepository: Repository<Deliverable>, deliverableTeamMembersRepository: Repository<DeliverableTeamMember>, historyRepository: Repository<DeliverableHistory>, tasksRepository: Repository<Task>, projectsRepository: Repository<Project>, usersRepository: Repository<User>, notificationsService: NotificationsService);
    create(projectId: string, type: DeliverableType, customType?: string): Promise<Deliverable>;
    findAll(projectId?: string): Promise<Deliverable[]>;
    findOne(id: string): Promise<Deliverable>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    updateStatus(id: string, status: DeliverableStatus, notes?: string, userId?: string, fileUrl?: string): Promise<Deliverable>;
    private handleFileRevisionRequest;
    getHistory(deliverableId: string, fileUrl?: string): Promise<DeliverableHistory[]>;
    private handleRevisionRequest;
    addTeamMember(deliverableId: string, userId: string): Promise<DeliverableTeamMember>;
    removeTeamMember(deliverableId: string, userId: string): Promise<{
        success: boolean;
    }>;
    getTeamMembers(deliverableId: string): Promise<{
        id: string;
        userId: string;
        user: User;
        assignedAt: Date;
    }[]>;
}
