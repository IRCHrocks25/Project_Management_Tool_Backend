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
exports.ProjectsController = void 0;
const common_1 = require("@nestjs/common");
const projects_service_1 = require("./projects.service");
const create_project_dto_1 = require("./dto/create-project.dto");
const create_project_webhook_dto_1 = require("./dto/create-project-webhook.dto");
const update_project_stage_dto_1 = require("./dto/update-project-stage.dto");
const webhook_guard_1 = require("./guards/webhook.guard");
let ProjectsController = class ProjectsController {
    constructor(projectsService) {
        this.projectsService = projectsService;
    }
    async create(createProjectDto, req) {
        return this.projectsService.create(createProjectDto, req.user?.userId);
    }
    async createFromWebhook(webhookDto) {
        try {
            return await this.projectsService.createFromWebhook(webhookDto);
        }
        catch (error) {
            console.error('[ProjectsController] Error in createFromWebhook:', error);
            console.error('[ProjectsController] Error stack:', error.stack);
            throw error;
        }
    }
    async getWebhookPM() {
        return this.projectsService.getWebhookPM();
    }
    async findAll(req) {
        return this.projectsService.findAll(req.user?.userId, req.user?.role);
    }
    async getStats(req) {
        return this.projectsService.getStats(req.user?.userId, req.user?.role);
    }
    async archiveProject(id) {
        return this.projectsService.archiveProject(id);
    }
    async completeProject(id) {
        return this.projectsService.completeProject(id);
    }
    async getActivity(id) {
        return this.projectsService.getActivity(id);
    }
    async updateStage(id, updateStageDto) {
        return this.projectsService.updateStage(id, updateStageDto);
    }
    async closeProject(id) {
        return this.projectsService.closeProject(id);
    }
    async findOne(id) {
        return this.projectsService.findOne(id);
    }
    async generateOnboardingTasks(id) {
        try {
            return await this.projectsService.generateOnboardingTasks(id);
        }
        catch (error) {
            console.error('[ProjectsController] Error in generateOnboardingTasks:', error);
            throw error;
        }
    }
    async addTeamMember(projectId, body) {
        return this.projectsService.addTeamMember(projectId, body.userId);
    }
    async getTeamMembers(projectId) {
        return this.projectsService.getTeamMembers(projectId);
    }
    async removeTeamMember(projectId, userId) {
        return this.projectsService.removeTeamMember(projectId, userId);
    }
};
exports.ProjectsController = ProjectsController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_project_dto_1.CreateProjectDto, Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('webhook'),
    (0, common_1.UseGuards)(webhook_guard_1.WebhookGuard),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_project_webhook_dto_1.CreateProjectWebhookDto]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "createFromWebhook", null);
__decorate([
    (0, common_1.Get)('webhook/pm'),
    (0, common_1.UseGuards)(webhook_guard_1.WebhookGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "getWebhookPM", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "getStats", null);
__decorate([
    (0, common_1.Patch)(':id/archive'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "archiveProject", null);
__decorate([
    (0, common_1.Patch)(':id/complete'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "completeProject", null);
__decorate([
    (0, common_1.Get)(':id/activity'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "getActivity", null);
__decorate([
    (0, common_1.Patch)(':id/stage'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_project_stage_dto_1.UpdateProjectStageDto]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "updateStage", null);
__decorate([
    (0, common_1.Patch)(':id/close'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "closeProject", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/generate-onboarding-tasks'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "generateOnboardingTasks", null);
__decorate([
    (0, common_1.Post)(':id/team-members'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "addTeamMember", null);
__decorate([
    (0, common_1.Get)(':id/team-members'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "getTeamMembers", null);
__decorate([
    (0, common_1.Delete)(':id/team-members/:userId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ProjectsController.prototype, "removeTeamMember", null);
exports.ProjectsController = ProjectsController = __decorate([
    (0, common_1.Controller)('projects'),
    __metadata("design:paramtypes", [projects_service_1.ProjectsService])
], ProjectsController);
//# sourceMappingURL=projects.controller.js.map