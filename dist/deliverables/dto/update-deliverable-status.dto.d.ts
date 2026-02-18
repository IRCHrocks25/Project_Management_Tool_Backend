import { DeliverableStatus } from '../entities/deliverable.entity';
export declare class UpdateDeliverableStatusDto {
    status: DeliverableStatus;
    notes?: string;
    fileUrl?: string;
}
