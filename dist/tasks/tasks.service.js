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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const task_entity_1 = require("./entities/task.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const deliverable_entity_1 = require("../deliverables/entities/deliverable.entity");
const project_entity_1 = require("../projects/entities/project.entity");
let TasksService = class TasksService {
    constructor(tasksRepository, deliverablesRepository, notificationsService) {
        this.tasksRepository = tasksRepository;
        this.deliverablesRepository = deliverablesRepository;
        this.notificationsService = notificationsService;
    }
    async findAll(projectId, assignedToId) {
        try {
            console.log(`[TasksService] Finding tasks - projectId: ${projectId}, assignedToId: ${assignedToId}`);
            try {
                await this.tasksRepository.query(`UPDATE tasks SET type = $1 WHERE type = $2`, [task_entity_1.TaskType.INTAKE, 'Intake']);
            }
            catch (updateError) {
                console.log('[TasksService] Could not update enum values (may already be fixed):', updateError.message);
            }
            const queryBuilder = this.tasksRepository
                .createQueryBuilder('task')
                .leftJoinAndSelect('task.project', 'project')
                .leftJoinAndSelect('task.assignedTo', 'assignedTo');
            if (projectId) {
                queryBuilder.where('task.projectId = :projectId', { projectId });
            }
            if (assignedToId) {
                queryBuilder.andWhere('task.assignedToId = :assignedToId', { assignedToId });
            }
            const tasks = await queryBuilder.orderBy('task.createdAt', 'DESC').getMany();
            for (const task of tasks) {
                if (task.type === 'Intake') {
                    task.type = task_entity_1.TaskType.INTAKE;
                    await this.tasksRepository.save(task).catch(err => {
                        console.error(`[TasksService] Could not save task ${task.id}:`, err);
                    });
                }
            }
            console.log(`[TasksService] Found ${tasks.length} tasks`);
            return tasks;
        }
        catch (error) {
            console.error('[TasksService] Error in findAll:', error);
            console.error('[TasksService] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
            });
            if (error.message && error.message.includes('enum')) {
                console.log('[TasksService] Enum error detected, attempting to fix...');
                try {
                    await this.tasksRepository.manager.query(`UPDATE tasks SET type = 'Onboarding' WHERE type = 'Intake'`);
                    const queryBuilder = this.tasksRepository
                        .createQueryBuilder('task')
                        .leftJoinAndSelect('task.project', 'project')
                        .leftJoinAndSelect('task.assignedTo', 'assignedTo');
                    if (projectId) {
                        queryBuilder.where('task.projectId = :projectId', { projectId });
                    }
                    if (assignedToId) {
                        queryBuilder.andWhere('task.assignedToId = :assignedToId', { assignedToId });
                    }
                    return await queryBuilder.orderBy('task.createdAt', 'DESC').getMany();
                }
                catch (retryError) {
                    console.error('[TasksService] Retry after enum fix also failed:', retryError);
                }
            }
            console.error('[TasksService] Returning empty array due to error');
            return [];
        }
    }
    async findOne(id) {
        const task = await this.tasksRepository.findOne({
            where: { id },
            relations: ['project', 'project.pm', 'assignedTo'],
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        return task;
    }
    async updateStatus(id, status, isCompleted, fileUrl, deliverableType, deliverableId) {
        const task = await this.findOne(id);
        const wasCompleted = task.isCompleted;
        const wasInReview = task.status === task_entity_1.TaskStatus.IN_REVIEW;
        const isChangingToInReview = status === task_entity_1.TaskStatus.IN_REVIEW && !wasInReview;
        task.status = status;
        if (isCompleted !== undefined) {
            task.isCompleted = isCompleted;
        }
        if (fileUrl !== undefined) {
            task.fileUrl = fileUrl;
        }
        if (deliverableId !== undefined) {
            task.deliverableId = deliverableId;
        }
        const savedTask = await this.tasksRepository.save(task);
        if (isChangingToInReview && (task.type === task_entity_1.TaskType.COPY || task.type === task_entity_1.TaskType.DESIGN)) {
            try {
                const projectRepo = this.tasksRepository.manager.getRepository(project_entity_1.Project);
                const projectWithPM = await projectRepo.findOne({
                    where: { id: task.projectId },
                });
                if (projectWithPM && projectWithPM.pmId) {
                    console.log('Creating notification for PM:', projectWithPM.pmId, 'Task:', task.title, 'Project:', projectWithPM.clientName);
                    await this.notificationsService.createTaskSentForReviewNotification(projectWithPM.pmId, savedTask.id, task.projectId, task.title, projectWithPM.clientName, !!fileUrl);
                    console.log('Notification created successfully');
                }
                else {
                    console.log('No PM found for project:', task.projectId, 'Project:', projectWithPM);
                }
                if (fileUrl && deliverableType) {
                    const deliverables = await this.deliverablesRepository.find({
                        where: { projectId: task.projectId },
                    });
                    let targetDeliverable = null;
                    if (deliverableId) {
                        targetDeliverable = deliverables.find(d => d.id === deliverableId);
                    }
                    else {
                        targetDeliverable = deliverables.find(d => d.type === deliverableType);
                        if (!targetDeliverable && deliverableType === 'Other') {
                            targetDeliverable = deliverables.find(d => d.type === 'Other' && d.customType);
                        }
                    }
                    if (targetDeliverable) {
                        targetDeliverable.fileUrl = fileUrl;
                        if (targetDeliverable.status === deliverable_entity_1.DeliverableStatus.REVISION) {
                            targetDeliverable.status = deliverable_entity_1.DeliverableStatus.READY_FOR_REVIEW;
                            targetDeliverable.notes = null;
                        }
                        else {
                            targetDeliverable.status = deliverable_entity_1.DeliverableStatus.READY_FOR_REVIEW;
                        }
                        await this.deliverablesRepository.save(targetDeliverable);
                        console.log('Updated deliverable:', deliverableType, 'with file URL');
                        if (task.type === task_entity_1.TaskType.DESIGN && task.project) {
                            const projectRepo = this.tasksRepository.manager.getRepository(project_entity_1.Project);
                            const project = await projectRepo.findOne({ where: { id: task.projectId } });
                            if (project && project.stage === project_entity_1.ProjectStage.DESIGN_REVISION) {
                                const designDeliverableTypes = [
                                    deliverable_entity_1.DeliverableType.LOGO,
                                    deliverable_entity_1.DeliverableType.SOCIAL_BANNERS,
                                    deliverable_entity_1.DeliverableType.SPEAKER_KIT,
                                    deliverable_entity_1.DeliverableType.LANDING_PAGE,
                                ];
                                const otherDesignDeliverables = deliverables.filter(d => designDeliverableTypes.includes(d.type) &&
                                    d.id !== targetDeliverable.id &&
                                    d.status === deliverable_entity_1.DeliverableStatus.REVISION);
                                if (otherDesignDeliverables.length === 0) {
                                    project.stage = project_entity_1.ProjectStage.DESIGN;
                                    await projectRepo.save(project);
                                    console.log('Updated project stage from Design Revision to Design');
                                }
                            }
                        }
                    }
                    else {
                        const newDeliverable = this.deliverablesRepository.create({
                            projectId: task.projectId,
                            type: deliverableType,
                            fileUrl: fileUrl,
                            status: deliverable_entity_1.DeliverableStatus.READY_FOR_REVIEW,
                        });
                        await this.deliverablesRepository.save(newDeliverable);
                        console.log('Created new deliverable:', deliverableType);
                    }
                }
            }
            catch (error) {
                console.error('Failed to update deliverables or create notification:', error);
            }
        }
        if (!wasCompleted && isCompleted && task.project && task.project.pmId) {
            try {
                await this.notificationsService.createTaskCompletedNotification(task.project.pmId, task.id, task.projectId, task.title, task.project.clientName);
            }
            catch (error) {
                console.error('Failed to create notification:', error);
            }
        }
        return savedTask;
    }
    async assignTask(id, assignedToId) {
        const task = await this.findOne(id);
        task.assignedToId = assignedToId;
        const savedTask = await this.tasksRepository.save(task);
        if (assignedToId && task.project) {
            try {
                await this.notificationsService.createTaskAssignedNotification(assignedToId, task.id, task.projectId, task.title, task.project.clientName);
            }
            catch (error) {
                console.error('Failed to create notification:', error);
            }
        }
        return savedTask;
    }
    async create(createTaskDto) {
        const task = this.tasksRepository.create(createTaskDto);
        return this.tasksRepository.save(task);
    }
    async submitOnboardingData(id, submissionData, submissionType) {
        const task = await this.findOne(id);
        if (task.type !== task_entity_1.TaskType.INTAKE) {
            throw new Error('Submissions are only allowed for onboarding tasks');
        }
        task.submissionData = submissionData;
        task.submissionType = submissionType;
        task.isCompleted = true;
        task.status = task_entity_1.TaskStatus.COMPLETED;
        return this.tasksRepository.save(task);
    }
    async update(id, updateTaskDto) {
        const task = await this.findOne(id);
        if (updateTaskDto.title !== undefined) {
            task.title = updateTaskDto.title;
        }
        if (updateTaskDto.description !== undefined) {
            task.description = updateTaskDto.description;
        }
        if (updateTaskDto.dueDate !== undefined) {
            task.dueDate = updateTaskDto.dueDate;
        }
        if (updateTaskDto.deliverableId !== undefined) {
            task.deliverableId = updateTaskDto.deliverableId;
        }
        return this.tasksRepository.save(task);
    }
    async remove(id) {
        const task = await this.findOne(id);
        await this.tasksRepository.remove(task);
        return { message: 'Task deleted successfully' };
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(task_entity_1.Task)),
    __param(1, (0, typeorm_1.InjectRepository)(deliverable_entity_1.Deliverable)),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map