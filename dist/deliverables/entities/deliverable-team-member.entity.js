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
exports.DeliverableTeamMember = void 0;
const typeorm_1 = require("typeorm");
const deliverable_entity_1 = require("./deliverable.entity");
const user_entity_1 = require("../../users/entities/user.entity");
let DeliverableTeamMember = class DeliverableTeamMember {
};
exports.DeliverableTeamMember = DeliverableTeamMember;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], DeliverableTeamMember.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => deliverable_entity_1.Deliverable, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'deliverableId' }),
    __metadata("design:type", deliverable_entity_1.Deliverable)
], DeliverableTeamMember.prototype, "deliverable", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], DeliverableTeamMember.prototype, "deliverableId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], DeliverableTeamMember.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], DeliverableTeamMember.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], DeliverableTeamMember.prototype, "assignedAt", void 0);
exports.DeliverableTeamMember = DeliverableTeamMember = __decorate([
    (0, typeorm_1.Entity)('deliverable_team_members'),
    (0, typeorm_1.Unique)(['deliverableId', 'userId'])
], DeliverableTeamMember);
//# sourceMappingURL=deliverable-team-member.entity.js.map