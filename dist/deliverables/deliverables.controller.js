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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliverablesController = void 0;
const common_1 = require("@nestjs/common");
const deliverables_service_1 = require("./deliverables.service");
const update_deliverable_status_dto_1 = require("./dto/update-deliverable-status.dto");
const create_deliverable_dto_1 = require("./dto/create-deliverable.dto");
let DeliverablesController = class DeliverablesController {
    constructor(deliverablesService) {
        this.deliverablesService = deliverablesService;
    }
    async create(createDto) {
        return this.deliverablesService.create(createDto.projectId, createDto.type, createDto.customType);
    }
    async findAll(projectId) {
        return this.deliverablesService.findAll(projectId);
    }
    async updateStatus(id, updateDto, req) {
        return this.deliverablesService.updateStatus(id, updateDto.status, updateDto.notes, req.user?.userId || req.user?.id, updateDto.fileUrl);
    }
    async findOne(id) {
        return this.deliverablesService.findOne(id);
    }
    async getHistory(id, fileUrl) {
        return this.deliverablesService.getHistory(id, fileUrl);
    }
    async addTeamMember(deliverableId, body) {
        return this.deliverablesService.addTeamMember(deliverableId, body.userId);
    }
    async getTeamMembers(deliverableId) {
        return this.deliverablesService.getTeamMembers(deliverableId);
    }
    async removeTeamMember(deliverableId, userId) {
        return this.deliverablesService.removeTeamMember(deliverableId, userId);
    }
};
exports.DeliverablesController = DeliverablesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_deliverable_dto_1.CreateDeliverableDto]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_deliverable_status_dto_1.UpdateDeliverableStatusDto, Object]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/history'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('fileUrl')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Post)(':id/team-members'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "addTeamMember", null);
__decorate([
    (0, common_1.Get)(':id/team-members'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "getTeamMembers", null);
__decorate([
    (0, common_1.Delete)(':id/team-members/:userId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], DeliverablesController.prototype, "removeTeamMember", null);
exports.DeliverablesController = DeliverablesController = __decorate([
    (0, common_1.Controller)('deliverables'),
    __metadata("design:paramtypes", [deliverables_service_1.DeliverablesService])
], DeliverablesController);
//# sourceMappingURL=deliverables.controller.js.map