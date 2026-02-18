import { Project } from './project.entity';
import { User } from '../../users/entities/user.entity';
export declare class ProjectTeamMember {
    id: string;
    project: Project;
    projectId: string;
    user: User;
    userId: string;
    assignedAt: Date;
}
