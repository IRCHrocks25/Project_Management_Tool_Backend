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
exports.EmailsController = void 0;
const common_1 = require("@nestjs/common");
const emails_service_1 = require("./emails.service");
const create_email_dto_1 = require("./dto/create-email.dto");
let EmailsController = class EmailsController {
    constructor(emailsService) {
        this.emailsService = emailsService;
    }
    async create(createEmailDto, req) {
        return this.emailsService.create(createEmailDto, req.user?.userId || req.user?.id);
    }
    async findAll(projectId) {
        return this.emailsService.findAll(projectId);
    }
};
exports.EmailsController = EmailsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_email_dto_1.CreateEmailDto, Object]),
    __metadata("design:returntype", Promise)
], EmailsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('project/:projectId'),
    __param(0, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EmailsController.prototype, "findAll", null);
exports.EmailsController = EmailsController = __decorate([
    (0, common_1.Controller)('emails'),
    __metadata("design:paramtypes", [emails_service_1.EmailsService])
], EmailsController);
//# sourceMappingURL=emails.controller.js.map