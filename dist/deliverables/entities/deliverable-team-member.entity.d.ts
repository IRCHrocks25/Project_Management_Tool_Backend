import { Deliverable } from './deliverable.entity';
import { User } from '../../users/entities/user.entity';
export declare class DeliverableTeamMember {
    id: string;
    deliverable: Deliverable;
    deliverableId: string;
    user: User;
    userId: string;
    assignedAt: Date;
}
