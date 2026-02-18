import { Deliverable } from './deliverable.entity';
import { User } from '../../users/entities/user.entity';
export declare enum DeliverableAction {
    APPROVED = "Approved",
    REVISION_REQUESTED = "Revision Requested",
    STATUS_CHANGED = "Status Changed"
}
export declare class DeliverableHistory {
    id: string;
    deliverable: Deliverable;
    deliverableId: string;
    fileUrl: string;
    user: User;
    userId: string;
    action: DeliverableAction;
    previousStatus: string;
    newStatus: string;
    notes: string;
    createdAt: Date;
}
