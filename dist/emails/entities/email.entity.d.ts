import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
export declare class Email {
    id: string;
    subject: string;
    body: string;
    recipientEmail: string;
    project: Project;
    projectId: string;
    sentBy: User;
    sentById: string;
    sentAt: Date;
    isOpened: boolean;
    createdAt: Date;
}
