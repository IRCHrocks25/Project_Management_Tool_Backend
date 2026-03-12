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
exports.DeliverablesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const deliverable_entity_1 = require("./entities/deliverable.entity");
const deliverable_team_member_entity_1 = require("./entities/deliverable-team-member.entity");
const deliverable_history_entity_1 = require("./entities/deliverable-history.entity");
const task_entity_1 = require("../tasks/entities/task.entity");
const project_entity_1 = require("../projects/entities/project.entity");
const user_entity_1 = require("../users/entities/user.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_entity_1 = require("../notifications/entities/notification.entity");
let DeliverablesService = class DeliverablesService {
    constructor(deliverablesRepository, deliverableTeamMembersRepository, historyRepository, tasksRepository, projectsRepository, usersRepository, notificationsService) {
        this.deliverablesRepository = deliverablesRepository;
        this.deliverableTeamMembersRepository = deliverableTeamMembersRepository;
        this.historyRepository = historyRepository;
        this.tasksRepository = tasksRepository;
        this.projectsRepository = projectsRepository;
        this.usersRepository = usersRepository;
        this.notificationsService = notificationsService;
    }
    async create(projectId, type, customType) {
        const project = await this.projectsRepository.findOne({
            where: { id: projectId },
        });
        if (!project) {
            throw new common_1.NotFoundException('Project not found');
        }
        const deliverable = this.deliverablesRepository.create({
            projectId,
            type,
            customType: customType || null,
            status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
        });
        return await this.deliverablesRepository.save(deliverable);
    }
    async findAll(projectId) {
        const queryBuilder = this.deliverablesRepository
            .createQueryBuilder('deliverable')
            .leftJoinAndSelect('deliverable.project', 'project')
            .leftJoinAndSelect('deliverable.teamMembers', 'teamMembers')
            .leftJoinAndSelect('teamMembers.user', 'teamMemberUser');
        if (projectId) {
            queryBuilder.where('deliverable.projectId = :projectId', { projectId });
        }
        return queryBuilder.orderBy('deliverable.createdAt', 'DESC').getMany();
    }
    async findOne(id) {
        const deliverable = await this.deliverablesRepository.findOne({
            where: { id },
            relations: ['project', 'teamMembers', 'teamMembers.user'],
        });
        if (!deliverable) {
            throw new common_1.NotFoundException('Deliverable not found');
        }
        return deliverable;
    }
    async remove(id) {
        const deliverable = await this.deliverablesRepository.findOne({ where: { id } });
        if (!deliverable) {
            throw new common_1.NotFoundException('Deliverable not found');
        }
        const isCustom = deliverable.type === deliverable_entity_1.DeliverableType.OTHER || !!deliverable.customType;
        if (!isCustom) {
            throw new common_1.BadRequestException('Only custom deliverables can be deleted');
        }
        const linkedTasksCount = await this.tasksRepository.count({
            where: { deliverableId: id },
        });
        if (linkedTasksCount > 0) {
            throw new common_1.BadRequestException('Cannot delete deliverable while tasks are linked to it');
        }
        await this.deliverableTeamMembersRepository.delete({ deliverableId: id });
        await this.historyRepository.delete({ deliverableId: id });
        await this.deliverablesRepository.delete(id);
        return { success: true };
    }
    async updateStatus(id, status, notes, userId, fileUrl) {
        const deliverable = await this.findOne(id);
        const previousStatus = deliverable.status;
        if (fileUrl) {
            let action = deliverable_history_entity_1.DeliverableAction.STATUS_CHANGED;
            if (status === deliverable_entity_1.DeliverableStatus.APPROVED) {
                action = deliverable_history_entity_1.DeliverableAction.APPROVED;
            }
            else if (status === deliverable_entity_1.DeliverableStatus.REVISION) {
                action = deliverable_history_entity_1.DeliverableAction.REVISION_REQUESTED;
            }
            const history = this.historyRepository.create({
                deliverableId: id,
                fileUrl: fileUrl,
                userId: userId || null,
                action,
                previousStatus: 'Ready for Review',
                newStatus: status === deliverable_entity_1.DeliverableStatus.APPROVED ? 'Approved' : 'Revision',
                notes: notes || null,
            });
            await this.historyRepository.save(history);
            if (status === deliverable_entity_1.DeliverableStatus.REVISION) {
                await this.handleFileRevisionRequest(deliverable, fileUrl);
            }
            if (status === deliverable_entity_1.DeliverableStatus.APPROVED && deliverable.type === deliverable_entity_1.DeliverableType.LANDING_PAGE) {
                const project = await this.projectsRepository.findOne({
                    where: { id: deliverable.projectId },
                });
                if (project) {
                    const isDesignFile = fileUrl.includes('figma.com') || fileUrl.includes('figma');
                    const designTasks = await this.tasksRepository.find({
                        where: {
                            projectId: deliverable.projectId,
                            fileUrl: fileUrl,
                            type: task_entity_1.TaskType.DESIGN,
                        },
                    });
                    if ((isDesignFile || designTasks.length > 0) && project.stage !== project_entity_1.ProjectStage.DEV) {
                        project.stage = project_entity_1.ProjectStage.DEV;
                        await this.projectsRepository.save(project);
                        console.log(`[DeliverablesService] Moved project ${project.id} (${project.clientName}) to Development stage after Home Page design approval`);
                    }
                }
            }
            return deliverable;
        }
        deliverable.status = status;
        if (notes !== undefined) {
            deliverable.notes = notes;
        }
        const savedDeliverable = await this.deliverablesRepository.save(deliverable);
        let action = deliverable_history_entity_1.DeliverableAction.STATUS_CHANGED;
        if (status === deliverable_entity_1.DeliverableStatus.APPROVED && previousStatus !== deliverable_entity_1.DeliverableStatus.APPROVED) {
            action = deliverable_history_entity_1.DeliverableAction.APPROVED;
        }
        else if (status === deliverable_entity_1.DeliverableStatus.REVISION && previousStatus !== deliverable_entity_1.DeliverableStatus.REVISION) {
            action = deliverable_history_entity_1.DeliverableAction.REVISION_REQUESTED;
        }
        const history = this.historyRepository.create({
            deliverableId: id,
            fileUrl: null,
            userId: userId || null,
            action,
            previousStatus,
            newStatus: status,
            notes: notes || null,
        });
        await this.historyRepository.save(history);
        if (status === deliverable_entity_1.DeliverableStatus.REVISION && previousStatus !== deliverable_entity_1.DeliverableStatus.REVISION) {
            await this.handleRevisionRequest(deliverable);
        }
        return savedDeliverable;
    }
    async handleFileRevisionRequest(deliverable, fileUrl) {
        const relatedTasks = await this.tasksRepository.find({
            where: {
                projectId: deliverable.projectId,
                fileUrl: fileUrl,
            },
        });
        const project = await this.projectsRepository.findOne({
            where: { id: deliverable.projectId },
        });
        if (!project)
            return;
        const designDeliverableTypes = [
            deliverable_entity_1.DeliverableType.LOGO,
            deliverable_entity_1.DeliverableType.SOCIAL_BANNERS,
            deliverable_entity_1.DeliverableType.SPEAKER_KIT,
            deliverable_entity_1.DeliverableType.LANDING_PAGE,
        ];
        if (designDeliverableTypes.includes(deliverable.type) && project.stage !== project_entity_1.ProjectStage.DESIGN_REVISION) {
            project.stage = project_entity_1.ProjectStage.DESIGN_REVISION;
            project.designRevisionCount += 1;
            if (deliverable.type === deliverable_entity_1.DeliverableType.LANDING_PAGE) {
                project.landingPageRevisionCount += 1;
            }
            await this.projectsRepository.save(project);
        }
        for (const task of relatedTasks) {
            task.status = task_entity_1.TaskStatus.IN_PROGRESS;
            task.isCompleted = false;
            await this.tasksRepository.save(task);
            if (task.assignedToId) {
                try {
                    const revData = {
                        type: notification_entity_1.NotificationType.REVISION_REQUESTED,
                        title: 'Revision requested',
                        message: `"${deliverable.customType || deliverable.type}" file for ${project?.clientName || 'project'} needs revision`,
                        projectId: deliverable.projectId,
                        taskId: task.id,
                    };
                    await this.notificationsService.create({ ...revData, userId: task.assignedToId });
                    this.notificationsService.notifyHeadPMsAlso(revData, task.assignedToId).catch(() => { });
                }
                catch (error) {
                    console.error('Failed to create revision notification:', error);
                }
            }
        }
    }
    async getHistory(deliverableId, fileUrl) {
        const where = { deliverableId };
        if (fileUrl) {
            where.fileUrl = fileUrl;
        }
        const history = await this.historyRepository.find({
            where,
            relations: ['user'],
            order: { createdAt: 'DESC' },
        });
        return history;
    }
    async handleRevisionRequest(deliverable) {
        const copyDeliverableTypes = [
            deliverable_entity_1.DeliverableType.BRAND_BOOK,
            deliverable_entity_1.DeliverableType.COPY_OF_LANDING_PAGE,
            deliverable_entity_1.DeliverableType.LANDING_PAGE,
            deliverable_entity_1.DeliverableType.SPEAKER_KIT,
            deliverable_entity_1.DeliverableType.OTHER,
        ];
        if (!copyDeliverableTypes.includes(deliverable.type)) {
            return;
        }
        try {
            let relatedCopyTasks = await this.tasksRepository.find({
                where: {
                    projectId: deliverable.projectId,
                    type: task_entity_1.TaskType.COPY,
                    deliverableId: deliverable.id,
                },
            });
            if (relatedCopyTasks.length === 0) {
                const deliverableName = deliverable.customType || deliverable.type;
                const allCopyTasks = await this.tasksRepository.find({
                    where: {
                        projectId: deliverable.projectId,
                        type: task_entity_1.TaskType.COPY,
                    },
                });
                relatedCopyTasks = allCopyTasks.filter(task => task.title.includes(deliverableName) ||
                    task.title.includes(deliverable.type));
            }
            for (const task of relatedCopyTasks) {
                task.status = task_entity_1.TaskStatus.IN_PROGRESS;
                task.isCompleted = false;
                await this.tasksRepository.save(task);
            }
            const project = await this.projectsRepository.findOne({
                where: { id: deliverable.projectId },
            });
            if (project && project.stage !== project_entity_1.ProjectStage.COPY_REVISION) {
                project.stage = project_entity_1.ProjectStage.COPY_REVISION;
                project.copyRevisionCount += 1;
                await this.projectsRepository.save(project);
            }
            for (const task of relatedCopyTasks) {
                if (task.assignedToId) {
                    try {
                        const revData = {
                            type: notification_entity_1.NotificationType.REVISION_REQUESTED,
                            title: 'Revision requested',
                            message: `"${deliverable.customType || deliverable.type}" for ${project?.clientName || 'project'} needs revision`,
                            projectId: deliverable.projectId,
                            taskId: task.id,
                        };
                        await this.notificationsService.create({ ...revData, userId: task.assignedToId });
                        this.notificationsService.notifyHeadPMsAlso(revData, task.assignedToId).catch(() => { });
                    }
                    catch (error) {
                        console.error('Failed to create revision notification:', error);
                    }
                }
            }
        }
        catch (error) {
            console.error('Failed to handle revision request:', error);
        }
    }
    async addTeamMember(deliverableId, userId) {
        const deliverable = await this.deliverablesRepository.findOne({ where: { id: deliverableId } });
        if (!deliverable) {
            throw new common_1.NotFoundException('Deliverable not found');
        }
        const existing = await this.deliverableTeamMembersRepository.findOne({
            where: { deliverableId, userId },
        });
        if (existing) {
            return existing;
        }
        const teamMember = this.deliverableTeamMembersRepository.create({
            deliverableId,
            userId,
        });
        return this.deliverableTeamMembersRepository.save(teamMember);
    }
    async removeTeamMember(deliverableId, userId) {
        const result = await this.deliverableTeamMembersRepository.delete({
            deliverableId,
            userId,
        });
        if (result.affected === 0) {
            throw new common_1.NotFoundException('Team member not found');
        }
        return { success: true };
    }
    async getTeamMembers(deliverableId) {
        const members = await this.deliverableTeamMembersRepository.find({
            where: { deliverableId },
            relations: ['user'],
        });
        return members.map((m) => ({
            id: m.id,
            userId: m.userId,
            user: m.user,
            assignedAt: m.assignedAt,
        }));
    }
    async update(id, updateDto) {
        console.log(`[DeliverablesService] update called for id: ${id}, data:`, updateDto);
        const deliverable = await this.findOne(id);
        const isCustom = deliverable.type === deliverable_entity_1.DeliverableType.OTHER || !!deliverable.customType;
        if (!isCustom) {
            throw new common_1.BadRequestException('Only custom deliverables can be updated');
        }
        if (updateDto.customType !== undefined) {
            deliverable.customType = updateDto.customType || null;
        }
        const updated = await this.deliverablesRepository.save(deliverable);
        console.log(`[DeliverablesService] update completed for id: ${id}, new customType: ${updated.customType}`);
        return updated;
    }
};
exports.DeliverablesService = DeliverablesService;
exports.DeliverablesService = DeliverablesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(deliverable_entity_1.Deliverable)),
    __param(1, (0, typeorm_1.InjectRepository)(deliverable_team_member_entity_1.DeliverableTeamMember)),
    __param(2, (0, typeorm_1.InjectRepository)(deliverable_history_entity_1.DeliverableHistory)),
    __param(3, (0, typeorm_1.InjectRepository)(task_entity_1.Task)),
    __param(4, (0, typeorm_1.InjectRepository)(project_entity_1.Project)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService])
], DeliverablesService);
//# sourceMappingURL=deliverables.service.js.map