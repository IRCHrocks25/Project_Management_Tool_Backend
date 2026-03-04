import { DeliverablesService } from './deliverables.service';
import { UpdateDeliverableStatusDto } from './dto/update-deliverable-status.dto';
import { CreateDeliverableDto } from './dto/create-deliverable.dto';
export declare class DeliverablesController {
    private readonly deliverablesService;
    constructor(deliverablesService: DeliverablesService);
    create(createDto: CreateDeliverableDto): Promise<import("./entities/deliverable.entity").Deliverable>;
    findAll(projectId?: string): Promise<import("./entities/deliverable.entity").Deliverable[]>;
    updateStatus(id: string, updateDto: UpdateDeliverableStatusDto, req: any): Promise<import("./entities/deliverable.entity").Deliverable>;
    findOne(id: string): Promise<import("./entities/deliverable.entity").Deliverable>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    getHistory(id: string, fileUrl?: string): Promise<import("./entities/deliverable-history.entity").DeliverableHistory[]>;
    addTeamMember(deliverableId: string, body: {
        userId: string;
    }): Promise<import("./entities/deliverable-team-member.entity").DeliverableTeamMember>;
    getTeamMembers(deliverableId: string): Promise<{
        id: string;
        userId: string;
        user: import("../users/entities/user.entity").User;
        assignedAt: Date;
    }[]>;
    removeTeamMember(deliverableId: string, userId: string): Promise<{
        success: boolean;
    }>;
}
