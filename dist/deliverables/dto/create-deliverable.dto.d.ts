import { DeliverableType } from '../entities/deliverable.entity';
export declare class CreateDeliverableDto {
    projectId: string;
    type: DeliverableType;
    customType?: string;
}
