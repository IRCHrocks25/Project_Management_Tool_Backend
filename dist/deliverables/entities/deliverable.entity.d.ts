import { Project } from '../../projects/entities/project.entity';
import { DeliverableTeamMember } from './deliverable-team-member.entity';
export declare enum DeliverableType {
    LOGO = "Logo",
    BRAND_BOOK = "Brand Book",
    LANDING_PAGE = "Home Page",
    COPY_OF_LANDING_PAGE = "Copy of Home Page",
    SPEAKER_KIT = "Speaker Kit",
    SOCIAL_BANNERS = "Social Banners",
    OTHER = "Other"
}
export declare enum DeliverableStatus {
    NOT_STARTED = "Not Started",
    IN_PROGRESS = "In Progress",
    READY_FOR_REVIEW = "Ready for Review",
    CLIENT_REVIEW = "Client Review",
    APPROVED = "Approved",
    REVISION = "Revision"
}
export declare class Deliverable {
    id: string;
    type: DeliverableType;
    customType: string;
    project: Project;
    projectId: string;
    status: DeliverableStatus;
    notes: string;
    fileUrl: string;
    teamMembers: DeliverableTeamMember[];
    createdAt: Date;
    updatedAt: Date;
}
