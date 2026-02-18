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
exports.DeliverableHistory = exports.DeliverableAction = void 0;
const typeorm_1 = require("typeorm");
const deliverable_entity_1 = require("./deliverable.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var DeliverableAction;
(function (DeliverableAction) {
    DeliverableAction["APPROVED"] = "Approved";
    DeliverableAction["REVISION_REQUESTED"] = "Revision Requested";
    DeliverableAction["STATUS_CHANGED"] = "Status Changed";
})(DeliverableAction || (exports.DeliverableAction = DeliverableAction = {}));
let DeliverableHistory = class DeliverableHistory {
};
exports.DeliverableHistory = DeliverableHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => deliverable_entity_1.Deliverable),
    (0, typeorm_1.JoinColumn)({ name: 'deliverableId' }),
    __metadata("design:type", deliverable_entity_1.Deliverable)
], DeliverableHistory.prototype, "deliverable", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "deliverableId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], DeliverableHistory.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: DeliverableAction,
    }),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "previousStatus", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "newStatus", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], DeliverableHistory.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], DeliverableHistory.prototype, "createdAt", void 0);
exports.DeliverableHistory = DeliverableHistory = __decorate([
    (0, typeorm_1.Entity)('deliverable_history')
], DeliverableHistory);
//# sourceMappingURL=deliverable-history.entity.js.map