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
exports.TaskFileHistory = exports.FileAction = void 0;
const typeorm_1 = require("typeorm");
const task_entity_1 = require("./task.entity");
const user_entity_1 = require("../../users/entities/user.entity");
var FileAction;
(function (FileAction) {
    FileAction["APPROVED"] = "Approved";
    FileAction["REVISION_REQUESTED"] = "Revision Requested";
    FileAction["SUBMITTED"] = "Submitted";
})(FileAction || (exports.FileAction = FileAction = {}));
let TaskFileHistory = class TaskFileHistory {
};
exports.TaskFileHistory = TaskFileHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => task_entity_1.Task),
    (0, typeorm_1.JoinColumn)({ name: 'taskId' }),
    __metadata("design:type", task_entity_1.Task)
], TaskFileHistory.prototype, "task", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "taskId", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "fileUrl", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", user_entity_1.User)
], TaskFileHistory.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: FileAction,
    }),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", String)
], TaskFileHistory.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], TaskFileHistory.prototype, "createdAt", void 0);
exports.TaskFileHistory = TaskFileHistory = __decorate([
    (0, typeorm_1.Entity)('task_file_history')
], TaskFileHistory);
//# sourceMappingURL=task-file-history.entity.js.map