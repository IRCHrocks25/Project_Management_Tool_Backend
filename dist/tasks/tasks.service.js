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
const task_assignee_entity_1 = require("./entities/task-assignee.entity");
const task_question_entity_1 = require("./entities/task-question.entity");
const task_comment_entity_1 = require("./entities/task-comment.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const deliverable_entity_1 = require("../deliverables/entities/deliverable.entity");
const project_entity_1 = require("../projects/entities/project.entity");
const user_entity_1 = require("../users/entities/user.entity");
const notification_entity_1 = require("../notifications/entities/notification.entity");
let TasksService = class TasksService {
    constructor(tasksRepository, taskAssigneesRepository, taskQuestionsRepository, taskCommentsRepository, deliverablesRepository, usersRepository, notificationsService) {
        this.tasksRepository = tasksRepository;
        this.taskAssigneesRepository = taskAssigneesRepository;
        this.taskQuestionsRepository = taskQuestionsRepository;
        this.taskCommentsRepository = taskCommentsRepository;
        this.deliverablesRepository = deliverablesRepository;
        this.usersRepository = usersRepository;
        this.notificationsService = notificationsService;
    }
    async shouldSuppressSelfNotifications(actorUserId) {
        if (!actorUserId)
            return false;
        try {
            const actor = await this.usersRepository.findOne({
                where: { id: actorUserId },
                select: ['id', 'isHeadPM', 'isTeamLead'],
            });
            if (actor?.isHeadPM || actor?.isTeamLead)
                return false;
            return true;
        }
        catch {
            return false;
        }
    }
    async findAll(projectId, assignedToId, limit, loadAll, taskType) {
        try {
            console.log(`[TasksService] Finding tasks - projectId: ${projectId}, assignedToId: ${assignedToId}, limit: ${limit}, loadAll: ${loadAll}, taskType: ${taskType}`);
            const queryBuilder = this.tasksRepository
                .createQueryBuilder('task')
                .leftJoinAndSelect('task.project', 'project')
                .leftJoinAndSelect('task.assignedTo', 'assignedTo')
                .leftJoinAndSelect('task.assignees', 'assignees')
                .leftJoinAndSelect('assignees.user', 'assigneeUser');
            const conditions = ['task.isArchived = :isArchived'];
            const params = { isArchived: false };
            if (projectId) {
                conditions.push('task.projectId = :projectId');
                params.projectId = projectId;
            }
            if (assignedToId) {
                conditions.push('task.assignedToId = :assignedToId');
                params.assignedToId = assignedToId;
            }
            if (taskType) {
                conditions.push('task.type::text = :taskType');
                params.taskType = taskType;
            }
            queryBuilder.where(conditions.join(' AND '), params);
            if (!loadAll) {
                const defaultLimit = limit || 200;
                if (!projectId && !assignedToId) {
                    queryBuilder.limit(defaultLimit);
                    console.log(`[TasksService] No filters provided - limiting to ${defaultLimit} most recent tasks for performance`);
                }
                else if (limit) {
                    queryBuilder.limit(limit);
                }
            }
            else {
                console.log('[TasksService] Loading all tasks (loadAll=true)');
            }
            const tasks = await queryBuilder.orderBy('task.createdAt', 'DESC').getMany();
            tasks.forEach((task) => {
                if (task.type === 'Intake') {
                    task.type = task_entity_1.TaskType.INTAKE;
                }
            });
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
                        .leftJoinAndSelect('task.assignedTo', 'assignedTo')
                        .leftJoinAndSelect('task.assignees', 'assignees')
                        .leftJoinAndSelect('assignees.user', 'assigneeUser');
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
            relations: ['project', 'project.pm', 'assignedTo', 'assignees', 'assignees.user'],
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        return task;
    }
    async updateStatus(id, status, isCompleted, fileUrl, deliverableType, deliverableId, actorUserId, reviewIntent) {
        const task = await this.findOne(id);
        const suppressSelfNotifications = await this.shouldSuppressSelfNotifications(actorUserId);
        const wasCompleted = task.isCompleted;
        const wasInReview = task.status === task_entity_1.TaskStatus.IN_REVIEW;
        const isChangingToInReview = status === task_entity_1.TaskStatus.IN_REVIEW && !wasInReview;
        let preLoadedDeliverables = [];
        let preValidatedTargetDeliverable = null;
        if (fileUrl && deliverableType && isChangingToInReview && reviewIntent !== 'revision') {
            preLoadedDeliverables = await this.deliverablesRepository.find({
                where: { projectId: task.projectId },
            });
            if (deliverableId) {
                preValidatedTargetDeliverable =
                    preLoadedDeliverables.find((d) => d.id === deliverableId) ?? null;
            }
            else {
                preValidatedTargetDeliverable =
                    preLoadedDeliverables.find((d) => d.type === deliverableType) ?? null;
                if (!preValidatedTargetDeliverable && deliverableType === 'Other') {
                    preValidatedTargetDeliverable =
                        preLoadedDeliverables.find((d) => d.type === 'Other' && d.customType) ?? null;
                }
            }
            if (!preValidatedTargetDeliverable) {
                throw new common_1.BadRequestException('No deliverable to attach this file to. Add the deliverable first.');
            }
        }
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
        if (isChangingToInReview && reviewIntent !== 'revision') {
            try {
                const projectWithPM = task.project;
                const promises = [];
                if (projectWithPM &&
                    projectWithPM.pmId &&
                    (!suppressSelfNotifications || projectWithPM.pmId !== actorUserId)) {
                    promises.push(this.notificationsService
                        .createTaskSentForReviewNotification(projectWithPM.pmId, savedTask.id, task.projectId, task.title, projectWithPM.clientName, !!fileUrl, task.type)
                        .catch((err) => {
                        console.error('Failed to create notification:', err);
                    }));
                }
                if (fileUrl && deliverableType && preValidatedTargetDeliverable) {
                    promises.push((async () => {
                        const targetDeliverable = preValidatedTargetDeliverable;
                        targetDeliverable.fileUrl = fileUrl;
                        if (targetDeliverable.status === deliverable_entity_1.DeliverableStatus.REVISION) {
                            targetDeliverable.status = deliverable_entity_1.DeliverableStatus.READY_FOR_REVIEW;
                            targetDeliverable.notes = null;
                        }
                        else {
                            targetDeliverable.status = deliverable_entity_1.DeliverableStatus.READY_FOR_REVIEW;
                        }
                        await this.deliverablesRepository.save(targetDeliverable);
                        if (task.type === task_entity_1.TaskType.DESIGN &&
                            projectWithPM &&
                            projectWithPM.stage === project_entity_1.ProjectStage.DESIGN_REVISION) {
                            const designDeliverableTypes = [
                                deliverable_entity_1.DeliverableType.LOGO,
                                deliverable_entity_1.DeliverableType.SOCIAL_BANNERS,
                                deliverable_entity_1.DeliverableType.SPEAKER_KIT,
                                deliverable_entity_1.DeliverableType.LANDING_PAGE,
                            ];
                            const otherDesignDeliverables = preLoadedDeliverables.filter((d) => designDeliverableTypes.includes(d.type) &&
                                d.id !== targetDeliverable.id &&
                                d.status === deliverable_entity_1.DeliverableStatus.REVISION);
                            if (otherDesignDeliverables.length === 0) {
                                const projectRepo = this.tasksRepository.manager.getRepository(project_entity_1.Project);
                                projectWithPM.stage = project_entity_1.ProjectStage.DESIGN;
                                await projectRepo.save(projectWithPM);
                            }
                        }
                    })().catch((err) => {
                        console.error('Failed to update deliverables:', err);
                    }));
                }
                await Promise.all(promises);
            }
            catch (error) {
                console.error('Failed to update deliverables or create notification:', error);
            }
        }
        if (!wasCompleted &&
            isCompleted &&
            task.project &&
            task.project.pmId &&
            (!suppressSelfNotifications || task.project.pmId !== actorUserId)) {
            try {
                await this.notificationsService.createTaskCompletedNotification(task.project.pmId, task.id, task.projectId, task.title, task.project.clientName, task.assignedToId, task.type);
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
        const existingAssignee = await this.taskAssigneesRepository.findOne({
            where: { taskId: id, userId: assignedToId },
        });
        if (!existingAssignee && assignedToId) {
            const taskAssignee = this.taskAssigneesRepository.create({
                taskId: id,
                userId: assignedToId,
            });
            await this.taskAssigneesRepository.save(taskAssignee);
        }
        if (assignedToId && task.project) {
            try {
                await this.notificationsService.createTaskAssignedNotification(assignedToId, task.id, task.projectId, task.title, task.project.clientName, assignedToId, task.type);
            }
            catch (error) {
                console.error('Failed to create notification:', error);
            }
        }
        return savedTask;
    }
    async assignTaskToMultiple(id, userIds) {
        const task = await this.tasksRepository.findOne({
            where: { id },
            relations: ['project'],
        });
        if (!task) {
            throw new common_1.NotFoundException(`Task with id ${id} not found`);
        }
        await this.taskAssigneesRepository.delete({ taskId: id });
        if (userIds.length > 0) {
            const assignees = userIds.map((userId) => this.taskAssigneesRepository.create({ taskId: id, userId }));
            await this.taskAssigneesRepository.save(assignees);
        }
        const primaryAssignee = userIds[0] ?? null;
        await this.tasksRepository.update(id, { assignedToId: primaryAssignee });
        if (task.project && userIds.length > 0) {
            for (const userId of userIds) {
                try {
                    await this.notificationsService.createTaskAssignedNotification(userId, task.id, task.projectId, task.title, task.project.clientName, userId, task.type);
                }
                catch (error) {
                    console.error(`Failed to create notification for user ${userId}:`, error);
                }
            }
        }
        return await this.findOne(id);
    }
    async create(createTaskDto, actorUserId) {
        const task = this.tasksRepository.create(createTaskDto);
        const savedTaskResult = await this.tasksRepository.save(task);
        const suppressSelfNotifications = await this.shouldSuppressSelfNotifications(actorUserId);
        if (Array.isArray(savedTaskResult)) {
            throw new Error('Unexpected: save() returned an array when saving a single task');
        }
        const savedTask = savedTaskResult;
        if (!savedTask.assignedToId && savedTask.type && savedTask.projectId) {
            try {
                const taskTypeToRoles = {
                    Copy: [user_entity_1.UserRole.COPY_WRITING],
                    Design: [user_entity_1.UserRole.DESIGNER],
                    Dev: [user_entity_1.UserRole.DEVELOPER],
                    AI: [user_entity_1.UserRole.AI_DEVELOPER],
                    'Social Media': [user_entity_1.UserRole.SOCIAL_MEDIA],
                    CRM: [user_entity_1.UserRole.CRM],
                    'SEO/GEO': [user_entity_1.UserRole.SEO_GEO],
                };
                const roles = taskTypeToRoles[savedTask.type];
                if (roles && roles.length > 0) {
                    const departmentUsers = await this.usersRepository.find({
                        where: roles.map((role) => ({ role })),
                        select: ['id', 'name', 'email', 'role'],
                    });
                    const project = await this.tasksRepository.manager
                        .getRepository(project_entity_1.Project)
                        .findOne({ where: { id: savedTask.projectId }, select: ['id', 'clientName'] });
                    const notificationPromises = departmentUsers
                        .filter((user) => !suppressSelfNotifications || user.id !== actorUserId)
                        .map((user) => this.notificationsService
                        .create({
                        type: notification_entity_1.NotificationType.TASK_AVAILABLE,
                        title: 'New task available',
                        message: `A new "${savedTask.title}" task is available for ${project?.clientName || 'Unknown Project'}. No one is assigned yet.`,
                        userId: user.id,
                        taskId: savedTask.id,
                        projectId: savedTask.projectId,
                        assignedToId: null,
                    })
                        .catch((err) => {
                        console.error(`Failed to create notification for user ${user.id}:`, err);
                    }));
                    await Promise.all(notificationPromises);
                    console.log(`[TasksService] Created notifications for ${departmentUsers.length} department members for unassigned task ${savedTask.id}`);
                    const headPMData = {
                        type: notification_entity_1.NotificationType.TASK_AVAILABLE,
                        title: 'New task available',
                        message: `A new "${savedTask.title}" task is available for ${project?.clientName || 'Unknown Project'}. No one is assigned yet.`,
                        projectId: savedTask.projectId,
                        taskId: savedTask.id,
                        assignedToId: null,
                    };
                    this.notificationsService
                        .notifyHeadPMsAlso(headPMData, suppressSelfNotifications ? actorUserId || '' : '')
                        .catch(() => { });
                }
            }
            catch (error) {
                console.error('Failed to create department notifications:', error);
            }
        }
        return savedTask;
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
        try {
            await this.notificationsService.deleteByTaskId(id);
        }
        catch (error) {
            console.error('[TasksService] Failed to delete notifications for task before removal', {
                taskId: id,
                error,
            });
        }
        await this.tasksRepository.remove(task);
        return { message: 'Task deleted successfully' };
    }
    extractMentionIdsFromText(text) {
        if (!text || typeof text !== 'string')
            return [];
        const regex = /\[\[USER_ID:([a-fA-F0-9-]{36})\]\]/g;
        const ids = [];
        let m;
        while ((m = regex.exec(text)) !== null) {
            if (m[1] && !ids.includes(m[1]))
                ids.push(m[1]);
        }
        return ids;
    }
    async createQuestion(taskId, createDto, userId) {
        const task = await this.tasksRepository.findOne({
            where: { id: taskId },
            relations: ['project'],
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const mentionIdsFromBody = createDto.mentionedUserIds && createDto.mentionedUserIds.length > 0
            ? createDto.mentionedUserIds
            : [];
        const mentionIdsFromText = this.extractMentionIdsFromText(createDto.text);
        const allMentionIds = [...new Set([...mentionIdsFromBody, ...mentionIdsFromText])];
        const question = this.taskQuestionsRepository.create({
            taskId,
            userId,
            text: createDto.text,
            mentionedUserIds: allMentionIds.length > 0 ? allMentionIds : null,
        });
        const savedQuestion = await this.taskQuestionsRepository.save(question);
        if (allMentionIds.length > 0) {
            for (const mentionedUserId of allMentionIds) {
                if (mentionedUserId === userId)
                    continue;
                try {
                    await this.notificationsService.create({
                        userId: mentionedUserId,
                        type: notification_entity_1.NotificationType.MENTION,
                        title: 'You were mentioned',
                        message: `You were mentioned in a question on task: ${task.title}`,
                        taskId: taskId,
                        projectId: task.projectId,
                    });
                }
                catch (error) {
                    console.error(`[TasksService] Failed to create mention notification for user ${mentionedUserId}:`, error);
                }
            }
        }
        const pmId = task.project?.pmId;
        if (pmId && pmId !== userId && !allMentionIds.includes(pmId)) {
            try {
                const pmData = {
                    type: notification_entity_1.NotificationType.TASK_UPDATE,
                    title: 'New conversation on your project',
                    message: `A new question was posted on task "${task.title}"`,
                    taskId,
                    projectId: task.projectId,
                };
                await this.notificationsService.create({ ...pmData, userId: pmId });
                this.notificationsService.notifyHeadPMsAlso(pmData, pmId).catch(() => { });
            }
            catch (error) {
                console.error(`[TasksService] Failed to create PM notification:`, error);
            }
        }
        return await this.taskQuestionsRepository.findOne({
            where: { id: savedQuestion.id },
            relations: ['user', 'comments', 'comments.user'],
            order: { comments: { createdAt: 'ASC' } },
        });
    }
    async createComment(questionId, createDto, userId) {
        const question = await this.taskQuestionsRepository.findOne({
            where: { id: questionId },
            relations: ['task', 'task.project', 'user'],
        });
        if (!question) {
            throw new common_1.NotFoundException('Question not found');
        }
        const mentionIdsFromBody = createDto.mentionedUserIds && createDto.mentionedUserIds.length > 0
            ? createDto.mentionedUserIds
            : [];
        const mentionIdsFromText = this.extractMentionIdsFromText(createDto.text);
        const allMentionIds = [...new Set([...mentionIdsFromBody, ...mentionIdsFromText])];
        const comment = this.taskCommentsRepository.create({
            questionId,
            userId,
            text: createDto.text,
            mentionedUserIds: allMentionIds.length > 0 ? allMentionIds : null,
        });
        const savedComment = await this.taskCommentsRepository.save(comment);
        if (question.userId !== userId) {
            const qAuthorData = {
                type: notification_entity_1.NotificationType.TASK_UPDATE,
                title: 'Question answered',
                message: `Someone answered your question on task: ${question.task.title}`,
                taskId: question.taskId,
                projectId: question.task.projectId,
            };
            await this.notificationsService.create({ ...qAuthorData, userId: question.userId });
            this.notificationsService.notifyHeadPMsAlso(qAuthorData, question.userId).catch(() => { });
        }
        for (const mentionedUserId of allMentionIds) {
            if (mentionedUserId === userId)
                continue;
            try {
                await this.notificationsService.create({
                    userId: mentionedUserId,
                    type: notification_entity_1.NotificationType.MENTION,
                    title: 'You were mentioned',
                    message: `You were mentioned in a comment on task: ${question.task.title}`,
                    taskId: question.taskId,
                    projectId: question.task.projectId,
                });
            }
            catch (error) {
                console.error(`[TasksService] Failed to create mention notification for user ${mentionedUserId}:`, error);
            }
        }
        const pmId = question.task.project?.pmId;
        const mentionedIds = allMentionIds;
        if (pmId && pmId !== userId && pmId !== question.userId && !mentionedIds.includes(pmId)) {
            try {
                const pmData = {
                    type: notification_entity_1.NotificationType.TASK_UPDATE,
                    title: 'New conversation on your project',
                    message: `A new comment was posted on task "${question.task.title}"`,
                    taskId: question.taskId,
                    projectId: question.task.projectId,
                };
                await this.notificationsService.create({ ...pmData, userId: pmId });
                this.notificationsService.notifyHeadPMsAlso(pmData, pmId).catch(() => { });
            }
            catch (error) {
                console.error(`[TasksService] Failed to create PM notification:`, error);
            }
        }
        const allCommentsOnQuestion = await this.taskCommentsRepository.find({
            where: { questionId },
        });
        const participantIds = new Set();
        participantIds.add(question.userId);
        for (const c of allCommentsOnQuestion) {
            if (c.userId)
                participantIds.add(c.userId);
        }
        participantIds.delete(userId);
        const alreadyNotified = new Set([userId, question.userId, ...allMentionIds]);
        if (pmId)
            alreadyNotified.add(pmId);
        const responseData = {
            type: notification_entity_1.NotificationType.TASK_UPDATE,
            title: 'New response in conversation',
            message: `Someone replied in a conversation on task: ${question.task.title}`,
            taskId: question.taskId,
            projectId: question.task.projectId,
        };
        for (const participantId of participantIds) {
            if (alreadyNotified.has(participantId))
                continue;
            try {
                await this.notificationsService.create({ ...responseData, userId: participantId });
            }
            catch (error) {
                console.error(`[TasksService] Failed to create conversation response notification for ${participantId}:`, error);
            }
        }
        return await this.taskCommentsRepository.findOne({
            where: { id: savedComment.id },
            relations: ['user'],
        });
    }
    async getConversations(taskId) {
        const task = await this.tasksRepository.findOne({ where: { id: taskId } });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        return await this.taskQuestionsRepository.find({
            where: { taskId },
            relations: ['user', 'comments', 'comments.user'],
            order: {
                createdAt: 'DESC',
                comments: { createdAt: 'ASC' },
            },
        });
    }
    async deleteQuestion(questionId) {
        const question = await this.taskQuestionsRepository.findOne({ where: { id: questionId } });
        if (!question) {
            throw new common_1.NotFoundException('Question not found');
        }
        const comments = await this.taskCommentsRepository.find({ where: { questionId } });
        await this.taskCommentsRepository.remove(comments);
        await this.taskQuestionsRepository.remove(question);
    }
    async getAllConversations() {
        const questions = await this.taskQuestionsRepository.find({
            relations: ['user', 'comments', 'comments.user', 'task', 'task.project'],
            order: {
                createdAt: 'DESC',
                comments: { createdAt: 'ASC' },
            },
        });
        return questions.map((q) => ({
            id: q.id,
            text: q.text,
            createdAt: q.createdAt,
            user: q.user
                ? { id: q.user.id, name: q.user.name, email: q.user.email, avatarUrl: q.user.avatarUrl }
                : null,
            comments: (q.comments || []).map((c) => ({
                id: c.id,
                text: c.text,
                createdAt: c.createdAt,
                user: c.user ? { id: c.user.id, name: c.user.name, avatarUrl: c.user.avatarUrl } : null,
            })),
            taskId: q.taskId,
            taskTitle: q.task?.title,
            projectId: q.task?.projectId,
            projectName: q.task?.project?.clientName,
        }));
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(task_entity_1.Task)),
    __param(1, (0, typeorm_1.InjectRepository)(task_assignee_entity_1.TaskAssignee)),
    __param(2, (0, typeorm_1.InjectRepository)(task_question_entity_1.TaskQuestion)),
    __param(3, (0, typeorm_1.InjectRepository)(task_comment_entity_1.TaskComment)),
    __param(4, (0, typeorm_1.InjectRepository)(deliverable_entity_1.Deliverable)),
    __param(5, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map