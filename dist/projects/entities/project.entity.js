"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Project = exports.ProjectStage = exports.Priority = exports.PackageType = exports.ClientType = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("../../users/entities/user.entity");
const task_entity_1 = require("../../tasks/entities/task.entity");
const deliverable_entity_1 = require("../../deliverables/entities/deliverable.entity");
const email_entity_1 = require("../../emails/entities/email.entity");
const project_team_member_entity_1 = require("./project-team-member.entity");
var ClientType;
(function (ClientType) {
    ClientType["ICON"] = "ICON";
    ClientType["STAR"] = "STAR";
    ClientType["KATALYST"] = "Katalyst";
    ClientType["PRIVATE"] = "Private";
})(ClientType || (exports.ClientType = ClientType = {}));
var PackageType;
(function (PackageType) {
    PackageType["STARTER"] = "Starter";
    PackageType["STANDARD"] = "Standard";
    PackageType["PREMIUM"] = "Premium";
    PackageType["ICON_PACKAGE"] = "ICON Package";
    PackageType["CUSTOM"] = "Custom";
})(PackageType || (exports.PackageType = PackageType = {}));
var Priority;
(function (Priority) {
    Priority["LOW"] = "Low";
    Priority["MEDIUM"] = "Medium";
    Priority["HIGH"] = "High";
    Priority["URGENT"] = "Urgent";
})(Priority || (exports.Priority = Priority = {}));
var ProjectStage;
(function (ProjectStage) {
    ProjectStage["INTAKE"] = "Onboarding";
    ProjectStage["COPY"] = "Copy";
    ProjectStage["COPY_REVISION"] = "Copy Revision";
    ProjectStage["DESIGN"] = "Design";
    ProjectStage["DESIGN_REVISION"] = "Design Revision";
    ProjectStage["DEV"] = "Dev";
    ProjectStage["AI_TEAM"] = "AI Team";
    ProjectStage["SOCIAL_MEDIA_TEAM"] = "Social Media Team";
    ProjectStage["CRM"] = "CRM";
    ProjectStage["SEO_GEO_TEAM"] = "SEO/GEO Team";
    ProjectStage["READY_TO_CLOSE"] = "Ready to Close";
    ProjectStage["CLOSED"] = "Closed";
})(ProjectStage || (exports.ProjectStage = ProjectStage = {}));
let Project = class Project {
};
exports.Project = Project;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Project.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Project.prototype, "clientName", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ClientType,
    }),
    __metadata("design:type", String)
], Project.prototype, "clientType", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: PackageType,
    }),
    __metadata("design:type", String)
], Project.prototype, "package", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: Priority,
        default: Priority.MEDIUM,
    }),
    __metadata("design:type", String)
], Project.prototype, "priority", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'pmId' }),
    __metadata("design:type", user_entity_1.User)
], Project.prototype, "pm", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Project.prototype, "pmId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Project.prototype, "targetCloseMonth", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Project.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ProjectStage,
        default: ProjectStage.INTAKE,
    }),
    __metadata("design:type", String)
], Project.prototype, "stage", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Project.prototype, "copyRevisionCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Project.prototype, "designRevisionCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Project.prototype, "lastEmailedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Date)
], Project.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Project.prototype, "isArchived", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Project.prototype, "isCompleted", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => task_entity_1.Task, (task) => task.project),
    __metadata("design:type", Array)
], Project.prototype, "tasks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => deliverable_entity_1.Deliverable, (deliverable) => deliverable.project),
    __metadata("design:type", Array)
], Project.prototype, "deliverables", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => email_entity_1.Email, (email) => email.project),
    __metadata("design:type", Array)
], Project.prototype, "emails", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => project_team_member_entity_1.ProjectTeamMember, (member) => member.project),
    __metadata("design:type", Array)
], Project.prototype, "teamMembers", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Project.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Project.prototype, "updatedAt", void 0);
exports.Project = Project = __decorate([
    (0, typeorm_1.Entity)('projects')
], Project);
//# sourceMappingURL=project.entity.js.map