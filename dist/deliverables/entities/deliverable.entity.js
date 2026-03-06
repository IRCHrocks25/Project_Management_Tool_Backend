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
exports.Deliverable = exports.DeliverableStatus = exports.DeliverableType = void 0;
const typeorm_1 = require("typeorm");
const project_entity_1 = require("../../projects/entities/project.entity");
const deliverable_team_member_entity_1 = require("./deliverable-team-member.entity");
var DeliverableType;
(function (DeliverableType) {
    DeliverableType["LOGO"] = "Logo";
    DeliverableType["BRAND_BOOK"] = "Brand Book";
    DeliverableType["LANDING_PAGE"] = "Home Page";
    DeliverableType["COPY_OF_LANDING_PAGE"] = "Copy of Home Page";
    DeliverableType["SPEAKER_KIT"] = "Speaker Kit";
    DeliverableType["SOCIAL_BANNERS"] = "Social Banners";
    DeliverableType["OTHER"] = "Other";
})(DeliverableType || (exports.DeliverableType = DeliverableType = {}));
var DeliverableStatus;
(function (DeliverableStatus) {
    DeliverableStatus["NOT_STARTED"] = "Not Started";
    DeliverableStatus["IN_PROGRESS"] = "In Progress";
    DeliverableStatus["READY_FOR_REVIEW"] = "Ready for Review";
    DeliverableStatus["CLIENT_REVIEW"] = "Client Review";
    DeliverableStatus["APPROVED"] = "Approved";
    DeliverableStatus["REVISION"] = "Revision";
})(DeliverableStatus || (exports.DeliverableStatus = DeliverableStatus = {}));
let Deliverable = class Deliverable {
};
exports.Deliverable = Deliverable;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Deliverable.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: DeliverableType,
    }),
    __metadata("design:type", String)
], Deliverable.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Deliverable.prototype, "customType", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => project_entity_1.Project, (project) => project.deliverables),
    (0, typeorm_1.JoinColumn)({ name: 'projectId' }),
    __metadata("design:type", project_entity_1.Project)
], Deliverable.prototype, "project", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Deliverable.prototype, "projectId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: DeliverableStatus,
        default: DeliverableStatus.NOT_STARTED,
    }),
    __metadata("design:type", String)
], Deliverable.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Deliverable.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], Deliverable.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => deliverable_team_member_entity_1.DeliverableTeamMember, (member) => member.deliverable),
    __metadata("design:type", Array)
], Deliverable.prototype, "teamMembers", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Deliverable.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Deliverable.prototype, "updatedAt", void 0);
exports.Deliverable = Deliverable = __decorate([
    (0, typeorm_1.Entity)('deliverables')
], Deliverable);
//# sourceMappingURL=deliverable.entity.js.map