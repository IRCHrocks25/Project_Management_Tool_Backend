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
exports.TasksController = void 0;
require("multer");
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const tasks_service_1 = require("./tasks.service");
const attachments_service_1 = require("./attachments.service");
const transfers_service_1 = require("./transfers.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const create_task_question_dto_1 = require("./dto/create-task-question.dto");
const create_task_comment_dto_1 = require("./dto/create-task-comment.dto");
const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
let TasksController = class TasksController {
    constructor(tasksService, attachmentsService, transfersService) {
        this.tasksService = tasksService;
        this.attachmentsService = attachmentsService;
        this.transfersService = transfersService;
    }
    async findAll(projectId, assignedToId, limit, all, taskType) {
        return this.tasksService.findAll(projectId, assignedToId, limit ? parseInt(limit) : undefined, all === 'true', taskType);
    }
    async getAllConversations() {
        return this.tasksService.getAllConversations();
    }
    async deleteQuestion(questionId) {
        return this.tasksService.deleteQuestion(questionId);
    }
    async getConversations(id) {
        return this.tasksService.getConversations(id);
    }
    async createQuestion(id, createDto, req) {
        return this.tasksService.createQuestion(id, createDto, req.user.userId);
    }
    async getAttachments(taskId) {
        return this.attachmentsService.findByTask(taskId);
    }
    async addAttachmentLink(taskId, body, req) {
        return this.attachmentsService.addLink(taskId, body.url, body.label, req.user.userId, body.note);
    }
    async uploadAttachments(taskId, files, body, req) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files provided');
        }
        return this.attachmentsService.upload(taskId, files, req.user.userId, body?.note);
    }
    async deleteAttachment(attachmentId, req) {
        return this.attachmentsService.delete(attachmentId, req.user.userId);
    }
    async transferTask(id, body, req) {
        return this.transfersService.transferTask(id, body, req.user.userId);
    }
    async getTransfers(id) {
        return this.transfersService.getTransfers(id);
    }
    async findOne(id) {
        const [task, attachments] = await Promise.all([
            this.tasksService.findOne(id),
            this.attachmentsService.findByTask(id),
        ]);
        return { ...task, attachments };
    }
    async create(createTaskDto) {
        return this.tasksService.create(createTaskDto);
    }
    async updateStatus(id, body) {
        return this.tasksService.updateStatus(id, body.status, body.isCompleted, body.fileUrl, body.deliverableType, body.deliverableId);
    }
    async assignTask(id, body) {
        if (body.userIds && Array.isArray(body.userIds)) {
            return this.tasksService.assignTaskToMultiple(id, body.userIds);
        }
        else if (body.assignedToId) {
            return this.tasksService.assignTask(id, body.assignedToId);
        }
        else {
            throw new common_1.BadRequestException('Either assignedToId or userIds must be provided');
        }
    }
    async submitOnboardingData(id, body) {
        return this.tasksService.submitOnboardingData(id, body.submissionData, body.submissionType);
    }
    async update(id, updateTaskDto) {
        return this.tasksService.update(id, updateTaskDto);
    }
    async remove(id) {
        return this.tasksService.remove(id);
    }
    async createComment(questionId, createDto, req) {
        return this.tasksService.createComment(questionId, createDto, req.user.userId);
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('projectId')),
    __param(1, (0, common_1.Query)('assignedToId')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('all')),
    __param(4, (0, common_1.Query)('taskType')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('conversations/all'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getAllConversations", null);
__decorate([
    (0, common_1.Delete)('questions/:questionId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('questionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "deleteQuestion", null);
__decorate([
    (0, common_1.Get)(':id/conversations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Post)(':id/questions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_task_question_dto_1.CreateTaskQuestionDto, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "createQuestion", null);
__decorate([
    (0, common_1.Get)(':id/attachments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getAttachments", null);
__decorate([
    (0, common_1.Post)(':id/attachments/link'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "addAttachmentLink", null);
__decorate([
    (0, common_1.Post)(':id/attachments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10, {
        limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    })),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.UploadedFiles)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "uploadAttachments", null);
__decorate([
    (0, common_1.Delete)(':id/attachments/:attachmentId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('attachmentId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "deleteAttachment", null);
__decorate([
    (0, common_1.Post)(':id/transfer'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "transferTask", null);
__decorate([
    (0, common_1.Get)(':id/transfers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "getTransfers", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/assign'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "assignTask", null);
__decorate([
    (0, common_1.Patch)(':id/submit'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "submitOnboardingData", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('questions/:questionId/comments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('questionId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_task_comment_dto_1.CreateTaskCommentDto, Object]),
    __metadata("design:returntype", Promise)
], TasksController.prototype, "createComment", null);
exports.TasksController = TasksController = __decorate([
    (0, common_1.Controller)('tasks'),
    __metadata("design:paramtypes", [tasks_service_1.TasksService,
        attachments_service_1.AttachmentsService,
        transfers_service_1.TransfersService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map