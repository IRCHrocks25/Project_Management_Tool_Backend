import { User } from '../../users/entities/user.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Deliverable } from '../../deliverables/entities/deliverable.entity';
import { Email } from '../../emails/entities/email.entity';
import { ProjectTeamMember } from './project-team-member.entity';
export declare enum ClientType {
    ICON = "ICON",
    STAR = "STAR",
    KATALYST = "Katalyst",
    PRIVATE = "Private"
}
export declare enum PackageType {
    STARTER = "Starter",
    STANDARD = "Standard",
    PREMIUM = "Premium",
    ICON_PACKAGE = "ICON Package",
    CUSTOM = "Custom"
}
export declare enum Priority {
    LOW = "Low",
    MEDIUM = "Medium",
    HIGH = "High",
    URGENT = "Urgent"
}
export declare enum ProjectStage {
    INTAKE = "Onboarding",
    COPY = "Copy",
    COPY_REVISION = "Copy Revision",
    DESIGN = "Design",
    DESIGN_REVISION = "Design Revision",
    DEV = "Dev",
    AI_TEAM = "AI Team",
    SOCIAL_MEDIA_TEAM = "Social Media Team",
    CRM = "CRM",
    SEO_GEO_TEAM = "SEO/GEO Team",
    READY_TO_CLOSE = "Ready to Close",
    CLOSED = "Closed"
}
export declare class Project {
    id: string;
    clientName: string;
    clientType: ClientType;
    package: PackageType;
    priority: Priority;
    pm: User;
    pmId: string;
    targetCloseMonth: string;
    notes: string;
    stage: ProjectStage;
    copyRevisionCount: number;
    designRevisionCount: number;
    lastEmailedAt: Date;
    closedAt: Date;
    tasks: Task[];
    deliverables: Deliverable[];
    emails: Email[];
    teamMembers: ProjectTeamMember[];
    createdAt: Date;
    updatedAt: Date;
}
