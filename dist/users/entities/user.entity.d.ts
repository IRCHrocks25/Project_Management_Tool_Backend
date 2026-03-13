export declare enum UserRole {
    FOUNDER_CEO = "FOUNDER/CEO",
    PROJECT_MANAGER = "Project Manager",
    COPY_WRITING = "Copy Writing",
    DESIGNER = "Designer",
    DEVELOPER = "Developer",
    AI_DEVELOPER = "AI Developer",
    SOCIAL_MEDIA = "Social Media",
    CRM = "CRM",
    SEO_GEO = "SEO/GEO"
}
export declare class User {
    id: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    isTeamLead: boolean;
    isHeadPM: boolean;
    createdAt: Date;
    updatedAt: Date;
    resetPasswordToken: string;
    resetPasswordExpires: Date;
    otpCode: string;
    otpExpires: Date;
    avatarUrl: string;
    birthday: string;
    bio: string;
}
