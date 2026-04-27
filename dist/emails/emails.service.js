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
exports.EmailsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const email_entity_1 = require("./entities/email.entity");
const projects_service_1 = require("../projects/projects.service");
const notifications_service_1 = require("../notifications/notifications.service");
let EmailsService = class EmailsService {
    constructor(emailsRepository, projectsService, notificationsService) {
        this.emailsRepository = emailsRepository;
        this.projectsService = projectsService;
        this.notificationsService = notificationsService;
    }
    async create(createEmailDto, userId) {
        const bodyValue = createEmailDto.body && createEmailDto.body.trim() !== '' ? createEmailDto.body : '';
        const email = this.emailsRepository.create({
            subject: createEmailDto.subject,
            recipientEmail: createEmailDto.recipientEmail,
            projectId: createEmailDto.projectId,
            body: bodyValue,
            sentById: userId,
            sentAt: new Date(),
        });
        const savedEmail = await this.emailsRepository.save(email);
        const project = await this.projectsService.findOne(createEmailDto.projectId);
        await this.projectsService.updateLastEmailed(createEmailDto.projectId);
        if (project && project.pmId) {
            try {
                await this.notificationsService.createEmailSentNotification(project.pmId, project.id, project.clientName);
            }
            catch (error) {
                console.error('Failed to create email notification:', error);
            }
        }
        return savedEmail;
    }
    async findAll(projectId) {
        return this.emailsRepository.find({
            where: { projectId },
            relations: ['sentBy'],
            order: { sentAt: 'DESC' },
        });
    }
};
exports.EmailsService = EmailsService;
exports.EmailsService = EmailsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(email_entity_1.Email)),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        projects_service_1.ProjectsService,
        notifications_service_1.NotificationsService])
], EmailsService);
//# sourceMappingURL=emails.service.js.map