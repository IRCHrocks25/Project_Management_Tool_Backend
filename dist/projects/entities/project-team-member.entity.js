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
exports.ProjectTeamMember = void 0;
const typeorm_1 = require("typeorm");
const project_entity_1 = require("./project.entity");
const user_entity_1 = require("../../users/entities/user.entity");
let ProjectTeamMember = class ProjectTeamMember {
};
exports.ProjectTeamMember = ProjectTeamMember;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ProjectTeamMember.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => project_entity_1.Project, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'projectId' }),
    __metadata("design:type", project_entity_1.Project)
], ProjectTeamMember.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProjectTeamMember.prototype, "projectId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], ProjectTeamMember.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ProjectTeamMember.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ProjectTeamMember.prototype, "assignedAt", void 0);
exports.ProjectTeamMember = ProjectTeamMember = __decorate([
    (0, typeorm_1.Entity)('project_team_members'),
    (0, typeorm_1.Unique)(['projectId', 'userId'])
], ProjectTeamMember);
//# sourceMappingURL=project-team-member.entity.js.map