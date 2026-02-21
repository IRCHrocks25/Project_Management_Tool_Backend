"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const project_entity_1 = require("./entities/project.entity");
const project_team_member_entity_1 = require("./entities/project-team-member.entity");
const task_entity_1 = require("../tasks/entities/task.entity");
const deliverable_entity_1 = require("../deliverables/entities/deliverable.entity");
const deliverable_history_entity_1 = require("../deliverables/entities/deliverable-history.entity");
const task_file_history_entity_1 = require("../tasks/entities/task-file-history.entity");
const user_entity_1 = require("../users/entities/user.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const auth_service_1 = require("../auth/auth.service");
let ProjectsService = class ProjectsService {
    constructor(projectsRepository, teamMembersRepository, tasksRepository, deliverablesRepository, deliverableHistoryRepository, taskFileHistoryRepository, usersRepository, notificationsService, authService) {
        this.projectsRepository = projectsRepository;
        this.teamMembersRepository = teamMembersRepository;
        this.tasksRepository = tasksRepository;
        this.deliverablesRepository = deliverablesRepository;
        this.deliverableHistoryRepository = deliverableHistoryRepository;
        this.taskFileHistoryRepository = taskFileHistoryRepository;
        this.usersRepository = usersRepository;
        this.notificationsService = notificationsService;
        this.authService = authService;
    }
    async create(createProjectDto, userId) {
        const allClientTypes = [
            createProjectDto.clientType,
            ...(createProjectDto.secondaryClientTypes || [])
        ];
        const isKatalyst = allClientTypes.some(type => type === project_entity_1.ClientType.KATALYST || String(type).toLowerCase() === 'katalyst');
        const initialStage = isKatalyst ? project_entity_1.ProjectStage.CRM : project_entity_1.ProjectStage.INTAKE;
        const project = this.projectsRepository.create({
            ...createProjectDto,
            secondaryClientTypes: createProjectDto.secondaryClientTypes?.map(t => t.toString()) || null,
            clientStartDate: createProjectDto.clientStartDate ? new Date(createProjectDto.clientStartDate) : null,
            pmId: createProjectDto.pmId || userId,
            stage: initialStage,
        });
        const savedProject = await this.projectsRepository.save(project);
        const deliverables = this.generateDeliverables(savedProject.id, createProjectDto.package, createProjectDto.clientType, createProjectDto.customDeliverables);
        await this.deliverablesRepository.save(deliverables);
        const intakeTasks = this.generateIntakeTasks(savedProject.id);
        await this.tasksRepository.save(intakeTasks);
        const projectWithRelations = await this.projectsRepository.findOne({
            where: { id: savedProject.id },
            relations: ['tasks', 'deliverables', 'pm'],
        });
        return projectWithRelations;
    }
    async createFromWebhook(webhookDto) {
        let pmId = webhookDto.pmId;
        if (!pmId) {
            const webhookPM = await this.authService.getOrCreateWebhookPM();
            pmId = webhookPM.id;
            console.log(`[Webhook] Using webhook PM account: ${pmId} (${webhookPM.name})`);
        }
        console.log(`[Webhook] Creating project: ${webhookDto.clientName} (${webhookDto.clientType}) - Package: ${webhookDto.package}, PM: ${pmId}, Source: ${webhookDto.sourceEmail || 'unknown'}`);
        const createProjectDto = {
            clientName: webhookDto.clientName,
            clientType: webhookDto.clientType,
            package: webhookDto.package,
            customDeliverables: webhookDto.customDeliverables,
            priority: webhookDto.priority,
            pmId: pmId,
            targetCloseMonth: webhookDto.targetCloseMonth,
            secondaryClientTypes: webhookDto.secondaryClientTypes,
            notes: webhookDto.notes
                ? `${webhookDto.notes}${webhookDto.sourceEmail ? `\n\nSource: ${webhookDto.sourceEmail}` : ''}${webhookDto.emailSubject ? `\nSubject: ${webhookDto.emailSubject}` : ''}`
                : webhookDto.sourceEmail
                    ? `Created via webhook from: ${webhookDto.sourceEmail}${webhookDto.emailSubject ? `\nSubject: ${webhookDto.emailSubject}` : ''}`
                    : 'Created via webhook',
        };
        const project = await this.create(createProjectDto, pmId);
        console.log(`[Webhook] Project created successfully: ${project.id} - ${project.clientName}`);
        return project;
    }
    async getWebhookPM() {
        const webhookPM = await this.authService.getOrCreateWebhookPM();
        return {
            id: webhookPM.id,
            name: webhookPM.name,
            email: webhookPM.email,
            role: webhookPM.role,
            message: 'Use this pmId in your webhook requests, or omit pmId to use this account automatically',
        };
    }
    generateDeliverables(projectId, packageType, clientType, customDeliverables) {
        const deliverables = [];
        if (packageType === project_entity_1.PackageType.CUSTOM && customDeliverables && customDeliverables.length > 0) {
            const deliverableTypeMap = {
                'Logo': deliverable_entity_1.DeliverableType.LOGO,
                'Brand Book': deliverable_entity_1.DeliverableType.BRAND_BOOK,
                'Landing Page': deliverable_entity_1.DeliverableType.LANDING_PAGE,
                'Copy of Landing Page': deliverable_entity_1.DeliverableType.COPY_OF_LANDING_PAGE,
                'Speaker Kit': deliverable_entity_1.DeliverableType.SPEAKER_KIT,
                'Social Banners': deliverable_entity_1.DeliverableType.SOCIAL_BANNERS,
                'Other': deliverable_entity_1.DeliverableType.OTHER,
            };
            for (const deliverableName of customDeliverables) {
                const deliverableType = deliverableTypeMap[deliverableName];
                if (deliverableType) {
                    deliverables.push({
                        projectId,
                        type: deliverableType,
                        status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
                    });
                }
            }
            return deliverables;
        }
        deliverables.push({
            projectId,
            type: deliverable_entity_1.DeliverableType.LOGO,
            status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
        });
        deliverables.push({
            projectId,
            type: deliverable_entity_1.DeliverableType.BRAND_BOOK,
            status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
        });
        if (clientType === project_entity_1.ClientType.ICON) {
            deliverables.push({
                projectId,
                type: deliverable_entity_1.DeliverableType.SPEAKER_KIT,
                status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
            });
        }
        if (packageType === project_entity_1.PackageType.PREMIUM || packageType === project_entity_1.PackageType.ICON_PACKAGE) {
            deliverables.push({
                projectId,
                type: deliverable_entity_1.DeliverableType.LANDING_PAGE,
                status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
            });
        }
        if (packageType !== project_entity_1.PackageType.STARTER) {
            deliverables.push({
                projectId,
                type: deliverable_entity_1.DeliverableType.SOCIAL_BANNERS,
                status: deliverable_entity_1.DeliverableStatus.NOT_STARTED,
            });
        }
        return deliverables;
    }
    generateIntakeTasks(projectId) {
        return [
            {
                projectId,
                title: 'CMD',
                description: 'Submit CMD information (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Branding Questionnaire',
                description: 'Submit branding questionnaire (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Laundry List',
                description: 'Submit laundry list (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Branding Agreement',
                description: 'Submit branding agreement (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Hosting Credentials & Domain',
                description: 'Submit hosting credentials and domain information (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Privacy Policy, Terms and Conditions, Cookiebot',
                description: 'Submit privacy policy, terms and conditions, and Cookiebot information (URL or text)',
                type: task_entity_1.TaskType.INTAKE,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
        ];
    }
    async findAll(userId, userRole, includeArchived = false) {
        try {
            const queryBuilder = this.projectsRepository
                .createQueryBuilder('project')
                .leftJoinAndSelect('project.pm', 'pm')
                .leftJoinAndSelect('project.deliverables', 'deliverables')
                .leftJoinAndSelect('project.emails', 'emails')
                .leftJoinAndSelect('project.teamMembers', 'teamMembers')
                .leftJoinAndSelect('teamMembers.user', 'teamMemberUser');
            if (userRole === 'Project Manager') {
                queryBuilder.where('project.pmId = :userId', { userId });
            }
            if (!includeArchived) {
                if (userRole === 'Project Manager') {
                    queryBuilder.andWhere('project.isArchived = :isArchived', { isArchived: false });
                    queryBuilder.andWhere('project.isCompleted = :isCompleted', { isCompleted: false });
                }
                else {
                    queryBuilder.where('project.isArchived = :isArchived', { isArchived: false });
                    queryBuilder.andWhere('project.isCompleted = :isCompleted', { isCompleted: false });
                }
            }
            const projects = await queryBuilder.orderBy('project.createdAt', 'DESC').getMany();
            for (const project of projects) {
                try {
                    project.tasks = await this.tasksRepository.find({
                        where: { projectId: project.id, isArchived: false },
                        relations: ['assignedTo'],
                    });
                    for (const task of project.tasks) {
                        if (task.type === 'Intake') {
                            task.type = task_entity_1.TaskType.INTAKE;
                            await this.tasksRepository.save(task);
                        }
                    }
                    if (project.stage === project_entity_1.ProjectStage.INTAKE) {
                        const onboardingTasks = project.tasks.filter((t) => t.type === task_entity_1.TaskType.INTAKE || t.type === 'Onboarding');
                        if (onboardingTasks.length === 0) {
                            console.log(`[ProjectsService] No onboarding tasks found for project ${project.id} (${project.clientName}) in findAll, creating them...`);
                            try {
                                const newTasks = this.generateIntakeTasks(project.id);
                                const savedTasks = await this.tasksRepository.save(newTasks);
                                project.tasks = [...project.tasks, ...savedTasks];
                                console.log(`[ProjectsService] Created ${savedTasks.length} onboarding tasks for project ${project.id}`);
                            }
                            catch (createError) {
                                console.error(`[ProjectsService] Error creating onboarding tasks for project ${project.id}:`, createError);
                            }
                        }
                    }
                }
                catch (error) {
                    console.error(`Error loading tasks for project ${project.id}:`, error);
                    project.tasks = [];
                }
                await this.checkAndMoveToDevelopment(project);
            }
            return projects;
        }
        catch (error) {
            console.error('Error in findAll:', error);
            throw error;
        }
    }
    async findOne(id) {
        try {
            console.log(`[ProjectsService] Finding project with ID: ${id}`);
            const project = await this.projectsRepository.findOne({
                where: { id },
                relations: ['pm', 'deliverables', 'emails', 'emails.sentBy', 'teamMembers', 'teamMembers.user'],
            });
            console.log(`[ProjectsService] Project found:`, project ? `Yes (${project.clientName})` : 'No');
            if (!project) {
                console.log(`[ProjectsService] Project not found for ID: ${id}`);
                throw new common_1.NotFoundException(`Project not found with ID: ${id}`);
            }
            try {
                project.tasks = await this.tasksRepository.find({
                    where: { projectId: id, isArchived: false },
                    relations: ['assignedTo'],
                });
                console.log(`[ProjectsService] Loaded ${project.tasks.length} tasks for project ${id}`);
                for (const task of project.tasks) {
                    if (task.type === 'Intake') {
                        task.type = task_entity_1.TaskType.INTAKE;
                        await this.tasksRepository.save(task);
                    }
                }
                if (project.stage === project_entity_1.ProjectStage.INTAKE) {
                    const onboardingTasks = project.tasks.filter((t) => t.type === task_entity_1.TaskType.INTAKE || t.type === 'Onboarding' || t.type === 'Intake');
                    if (onboardingTasks.length === 0) {
                        console.log(`[ProjectsService] No onboarding tasks found for project ${id}, creating them automatically...`);
                        try {
                            const intakeTasks = this.generateIntakeTasks(id);
                            const savedTasks = [];
                            let enumValue = 'Onboarding';
                            try {
                                const enumCheck = await this.tasksRepository.manager.query(`SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value`);
                                const hasOnboarding = enumCheck.some((e) => e.enum_value === 'Onboarding');
                                if (!hasOnboarding) {
                                    console.log(`[ProjectsService] 'Onboarding' not in enum, will use 'Intake' and update`);
                                    enumValue = 'Intake';
                                }
                            }
                            catch (enumError) {
                                console.log(`[ProjectsService] Could not check enum, defaulting to 'Onboarding'`);
                            }
                            for (const taskData of intakeTasks) {
                                try {
                                    const result = await this.tasksRepository.manager.query(`INSERT INTO tasks (id, "projectId", title, description, type, status, "isCompleted", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                     RETURNING id`, [id, taskData.title, taskData.description || null, enumValue, 'Todo', false]);
                                    if (result && result.length > 0) {
                                        if (enumValue === 'Intake') {
                                            try {
                                                await this.tasksRepository.manager.query(`UPDATE tasks SET type = 'Onboarding' WHERE id = $1 AND type = 'Intake'`, [result[0].id]);
                                            }
                                            catch (updateError) {
                                                console.log(`[ProjectsService] Could not update task ${result[0].id} to 'Onboarding', keeping 'Intake'`);
                                            }
                                        }
                                        const savedTask = await this.tasksRepository.findOne({
                                            where: { id: result[0].id },
                                            relations: ['assignedTo'],
                                        });
                                        if (savedTask) {
                                            savedTasks.push(savedTask);
                                            console.log(`[ProjectsService] Auto-created task: ${savedTask.title} (${savedTask.type})`);
                                        }
                                    }
                                }
                                catch (taskError) {
                                    console.error(`[ProjectsService] Failed to create task ${taskData.title}:`, taskError.message);
                                }
                            }
                            const allTasks = await this.tasksRepository.find({
                                where: { projectId: id },
                                relations: ['assignedTo'],
                            });
                            for (const task of allTasks) {
                                if (task.type === 'Intake') {
                                    task.type = task_entity_1.TaskType.INTAKE;
                                    await this.tasksRepository.save(task);
                                }
                            }
                            project.tasks = allTasks;
                            console.log(`[ProjectsService] Auto-created ${savedTasks.length} onboarding tasks. Total tasks now: ${project.tasks.length}`);
                        }
                        catch (createError) {
                            console.error(`[ProjectsService] Error auto-creating onboarding tasks:`, createError.message);
                        }
                    }
                    else {
                        console.log(`[ProjectsService] Project ${id} already has ${onboardingTasks.length} onboarding tasks`);
                    }
                }
            }
            catch (error) {
                console.error(`[ProjectsService] Error loading tasks for project ${id}:`, error);
                project.tasks = [];
            }
            await this.checkAndMoveToDevelopment(project);
            return project;
        }
        catch (error) {
            console.error('Error in findOne:', error);
            throw error;
        }
    }
    async checkAndMoveToDevelopment(project) {
        try {
            if (project.stage !== project_entity_1.ProjectStage.DESIGN && project.stage !== project_entity_1.ProjectStage.DESIGN_REVISION) {
                return;
            }
            const landingPageDeliverable = project.deliverables?.find((d) => d.type === deliverable_entity_1.DeliverableType.LANDING_PAGE);
            if (!landingPageDeliverable) {
                return;
            }
            const allTasks = await this.tasksRepository.find({
                where: { projectId: project.id },
            });
            const designTasks = allTasks.filter((t) => t.type === task_entity_1.TaskType.DESIGN && t.fileUrl && (t.fileUrl.includes('figma.com') || t.fileUrl.includes('figma')));
            if (designTasks.length === 0) {
                return;
            }
            const { DeliverableHistory } = await Promise.resolve().then(() => __importStar(require('../deliverables/entities/deliverable-history.entity')));
            const historyRepository = this.projectsRepository.manager.getRepository(DeliverableHistory);
            let allDesignFilesApproved = true;
            for (const task of designTasks) {
                const fileHistory = await historyRepository.find({
                    where: {
                        deliverableId: landingPageDeliverable.id,
                        fileUrl: task.fileUrl,
                    },
                    order: { createdAt: 'DESC' },
                    take: 1,
                });
                const isApproved = fileHistory.length > 0 && fileHistory[0].action === 'Approved';
                if (!isApproved) {
                    allDesignFilesApproved = false;
                    break;
                }
            }
            if (allDesignFilesApproved) {
                project.stage = project_entity_1.ProjectStage.DEV;
                await this.projectsRepository.save(project);
                console.log(`[ProjectsService] Moved project ${project.id} (${project.clientName}) to Development stage - all Landing Page design files are approved`);
            }
        }
        catch (error) {
            console.error('[ProjectsService] Error checking Landing Page design approval:', error);
        }
    }
    async updateStage(id, updateStageDto) {
        const project = await this.findOne(id);
        const previousStage = project.stage;
        if (updateStageDto.stage === project_entity_1.ProjectStage.COPY_REVISION) {
            project.copyRevisionCount += 1;
        }
        if (updateStageDto.stage === project_entity_1.ProjectStage.DESIGN_REVISION) {
            project.designRevisionCount += 1;
        }
        project.stage = updateStageDto.stage;
        const savedProject = await this.projectsRepository.save(project);
        if (updateStageDto.stage === project_entity_1.ProjectStage.COPY && previousStage !== project_entity_1.ProjectStage.COPY) {
            const copyTasks = this.generateCopyTasks(savedProject.id);
            await this.tasksRepository.save(copyTasks);
        }
        try {
            await this.notificationsService.createProjectStageChangedNotification(project.pmId, project.id, project.clientName, updateStageDto.stage);
        }
        catch (error) {
            console.error('Failed to create notification:', error);
        }
        return savedProject;
    }
    async update(id, updateProjectDto) {
        const project = await this.findOne(id);
        if (!project) {
            throw new common_1.NotFoundException(`Project with ID ${id} not found`);
        }
        if (updateProjectDto.clientName !== undefined) {
            project.clientName = updateProjectDto.clientName;
        }
        if (updateProjectDto.clientType !== undefined) {
            project.clientType = updateProjectDto.clientType;
        }
        if (updateProjectDto.secondaryClientTypes !== undefined) {
            project.secondaryClientTypes = updateProjectDto.secondaryClientTypes.map(t => t.toString()) || null;
        }
        return await this.projectsRepository.save(project);
    }
    generateCopyTasks(projectId) {
        return [
            {
                projectId,
                title: 'Write Copy',
                description: 'Create all copy content for the project',
                type: task_entity_1.TaskType.COPY,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
            {
                projectId,
                title: 'Review Copy',
                description: 'Review and refine copy content',
                type: task_entity_1.TaskType.COPY,
                status: task_entity_1.TaskStatus.TODO,
                isCompleted: false,
            },
        ];
    }
    async updateLastEmailed(id) {
        const project = await this.findOne(id);
        project.lastEmailedAt = new Date();
        return this.projectsRepository.save(project);
    }
    async generateOnboardingTasks(id) {
        try {
            console.log(`[ProjectsService] generateOnboardingTasks called for project ${id}`);
            const project = await this.projectsRepository.findOne({ where: { id } });
            if (!project) {
                console.log(`[ProjectsService] Project not found: ${id}`);
                throw new common_1.NotFoundException('Project not found');
            }
            console.log(`[ProjectsService] Project found: ${project.clientName}, stage: ${project.stage}`);
            const existingTasks = await this.tasksRepository.find({
                where: { projectId: id },
            });
            const onboardingTasks = existingTasks.filter((t) => t.type === task_entity_1.TaskType.INTAKE || t.type === 'Onboarding' || t.type === 'Intake');
            console.log(`[ProjectsService] Found ${onboardingTasks.length} existing onboarding tasks out of ${existingTasks.length} total tasks`);
            if (onboardingTasks.length > 0) {
                console.log(`[ProjectsService] Onboarding tasks already exist, returning them`);
                return { message: 'Onboarding tasks already exist', tasks: onboardingTasks };
            }
            console.log(`[ProjectsService] Generating ${6} onboarding tasks...`);
            const intakeTasks = this.generateIntakeTasks(id);
            console.log(`[ProjectsService] Generated tasks:`, intakeTasks.map((t) => ({ title: t.title, type: t.type })));
            const savedTasks = [];
            for (const taskData of intakeTasks) {
                try {
                    try {
                        const task = this.tasksRepository.create(taskData);
                        const saved = await this.tasksRepository.save(task);
                        savedTasks.push(saved);
                        console.log(`[ProjectsService] Saved task via TypeORM: ${saved.title} (${saved.id})`);
                    }
                    catch (typeormError) {
                        console.log(`[ProjectsService] TypeORM save failed, trying raw SQL for ${taskData.title}:`, typeormError.message);
                        try {
                            const enumCheck = await this.tasksRepository.manager.query(`SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value`);
                            console.log(`[ProjectsService] Available enum values:`, enumCheck.map((e) => e.enum_value));
                            let enumValue = 'Onboarding';
                            const hasOnboarding = enumCheck.some((e) => e.enum_value === 'Onboarding');
                            if (!hasOnboarding) {
                                console.log(`[ProjectsService] 'Onboarding' not in enum, using 'Intake' instead`);
                                enumValue = 'Intake';
                            }
                            const result = await this.tasksRepository.manager.query(`INSERT INTO tasks (id, "projectId", title, description, type, status, "isCompleted", "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                 RETURNING id`, [
                                id,
                                taskData.title,
                                taskData.description || null,
                                enumValue,
                                'Todo',
                                taskData.isCompleted || false,
                            ]);
                            if (result && result.length > 0) {
                                if (enumValue === 'Intake' && hasOnboarding) {
                                    try {
                                        await this.tasksRepository.manager.query(`UPDATE tasks SET type = 'Onboarding' WHERE id = $1`, [result[0].id]);
                                    }
                                    catch (updateError) {
                                        console.log(`[ProjectsService] Could not update to 'Onboarding', keeping 'Intake'`);
                                    }
                                }
                                const savedTask = await this.tasksRepository.findOne({
                                    where: { id: result[0].id },
                                    relations: ['assignedTo'],
                                });
                                if (savedTask) {
                                    savedTasks.push(savedTask);
                                    console.log(`[ProjectsService] Saved task via raw SQL: ${savedTask.title} (${savedTask.id})`);
                                }
                            }
                        }
                        catch (sqlError) {
                            console.error(`[ProjectsService] Raw SQL failed for ${taskData.title}:`, sqlError.message);
                            console.error(`[ProjectsService] SQL error code:`, sqlError.code);
                            console.error(`[ProjectsService] SQL error detail:`, sqlError.detail);
                        }
                    }
                }
                catch (taskError) {
                    console.error(`[ProjectsService] Error saving task ${taskData.title}:`, taskError);
                    console.error(`[ProjectsService] Task error details:`, taskError.message, taskError.stack);
                }
            }
            console.log(`[ProjectsService] Successfully created ${savedTasks.length} onboarding tasks`);
            return { message: 'Onboarding tasks created successfully', tasks: savedTasks };
        }
        catch (error) {
            console.error(`[ProjectsService] Error generating onboarding tasks for project ${id}:`, error);
            console.error(`[ProjectsService] Error details:`, error.message, error.stack);
            throw error;
        }
    }
    async closeProject(id) {
        const project = await this.findOne(id);
        project.stage = project_entity_1.ProjectStage.CLOSED;
        project.closedAt = new Date();
        return this.projectsRepository.save(project);
    }
    async archiveProject(id, userId) {
        return await this.projectsRepository.manager.transaction(async (transactionalEntityManager) => {
            const project = await transactionalEntityManager.findOne(project_entity_1.Project, {
                where: { id },
            });
            if (!project) {
                throw new common_1.NotFoundException(`Project not found with ID: ${id}`);
            }
            if (project.isArchived) {
                return project;
            }
            project.isArchived = true;
            project.archivedAt = new Date();
            if (userId) {
                project.archivedByUserId = userId;
            }
            await transactionalEntityManager.save(project_entity_1.Project, project);
            await transactionalEntityManager.update(task_entity_1.Task, { projectId: id }, { isArchived: true });
            return project;
        });
    }
    async completeProject(id, userId) {
        try {
            return await this.projectsRepository.manager.transaction(async (transactionalEntityManager) => {
                const project = await transactionalEntityManager.findOne(project_entity_1.Project, {
                    where: { id },
                });
                if (!project) {
                    throw new common_1.NotFoundException(`Project not found with ID: ${id}`);
                }
                if (project.isCompleted) {
                    return project;
                }
                project.isCompleted = true;
                project.completedAt = new Date();
                if (userId) {
                    project.completedByUserId = userId;
                }
                await transactionalEntityManager.save(project_entity_1.Project, project);
                console.log(`[ProjectsService] Project ${id} marked as complete by user ${userId}`);
                return project;
            });
        }
        catch (error) {
            console.error(`[ProjectsService] Error completing project ${id}:`, error);
            console.error(`[ProjectsService] Error details:`, error.message, error.stack);
            throw error;
        }
    }
    async getCompletedProjects(userId, userRole) {
        try {
            const queryBuilder = this.projectsRepository
                .createQueryBuilder('project')
                .leftJoinAndSelect('project.pm', 'pm')
                .leftJoinAndSelect('project.deliverables', 'deliverables')
                .leftJoinAndSelect('project.emails', 'emails')
                .leftJoinAndSelect('project.teamMembers', 'teamMembers')
                .leftJoinAndSelect('teamMembers.user', 'teamMemberUser')
                .where('project.isCompleted = :isCompleted', { isCompleted: true });
            if (userRole === 'Project Manager') {
                queryBuilder.andWhere('project.pmId = :userId', { userId });
            }
            const projects = await queryBuilder.orderBy('project.completedAt', 'DESC').getMany();
            for (const project of projects) {
                try {
                    project.tasks = await this.tasksRepository.find({
                        where: { projectId: project.id, isArchived: false },
                        relations: ['assignedTo'],
                    });
                }
                catch (error) {
                    console.error(`Error loading tasks for project ${project.id}:`, error);
                    project.tasks = [];
                }
            }
            return projects;
        }
        catch (error) {
            console.error('Error in getCompletedProjects:', error);
            throw error;
        }
    }
    async getStats(userId, userRole) {
        const queryBuilder = this.projectsRepository.createQueryBuilder('project');
        if (userRole === 'Project Manager') {
            queryBuilder.where('project.pmId = :userId', { userId })
                .andWhere('project.isArchived = :isArchived', { isArchived: false });
        }
        else {
            queryBuilder.where('project.isArchived = :isArchived', { isArchived: false });
        }
        const total = await queryBuilder.getCount();
        const byStage = await queryBuilder
            .select('project.stage', 'stage')
            .addSelect('COUNT(*)', 'count')
            .groupBy('project.stage')
            .getRawMany();
        const overdueQueryBuilder = this.projectsRepository.createQueryBuilder('project');
        if (userRole === 'Project Manager') {
            overdueQueryBuilder.where('project.pmId = :userId', { userId })
                .andWhere('project.isArchived = :isArchived', { isArchived: false });
        }
        else {
            overdueQueryBuilder.where('project.isArchived = :isArchived', { isArchived: false });
        }
        const overdue = await overdueQueryBuilder
            .andWhere('project.lastEmailedAt < :fiveDaysAgo', {
            fiveDaysAgo: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        })
            .andWhere('project.stage IN (:...waitingStages)', {
            waitingStages: [project_entity_1.ProjectStage.COPY_REVISION, project_entity_1.ProjectStage.DESIGN_REVISION],
        })
            .getCount();
        return {
            total,
            byStage,
            overdue,
        };
    }
    async addTeamMember(projectId, userId) {
        const project = await this.projectsRepository.findOne({ where: { id: projectId } });
        if (!project) {
            throw new common_1.NotFoundException('Project not found');
        }
        const existing = await this.teamMembersRepository.findOne({
            where: { projectId, userId },
        });
        if (existing) {
            return existing;
        }
        const teamMember = this.teamMembersRepository.create({
            projectId,
            userId,
        });
        return this.teamMembersRepository.save(teamMember);
    }
    async removeTeamMember(projectId, userId) {
        const result = await this.teamMembersRepository.delete({
            projectId,
            userId,
        });
        if (result.affected === 0) {
            throw new common_1.NotFoundException('Team member not found');
        }
        return { success: true };
    }
    async getTeamMembers(projectId) {
        const members = await this.teamMembersRepository.find({
            where: { projectId },
            relations: ['user'],
        });
        return members.map((m) => ({
            id: m.id,
            userId: m.userId,
            user: m.user,
            assignedAt: m.assignedAt,
        }));
    }
    async getActivity(projectId) {
        try {
            console.log(`[ProjectsService] Getting activity for project: ${projectId}`);
            const project = await this.findOne(projectId);
            if (!project) {
                console.error(`[ProjectsService] Project not found: ${projectId}`);
                return [];
            }
            const activities = [];
            activities.push({
                id: `project-created-${project.id}`,
                type: 'project',
                action: 'Project Created',
                department: 'Project Management',
                user: project.pm,
                userId: project.pmId,
                createdAt: project.createdAt,
                metadata: {
                    projectName: project.clientName,
                    stage: project.stage,
                },
            });
            if (project.lastEmailedAt) {
                activities.push({
                    id: `email-sent-${project.id}`,
                    type: 'email',
                    action: 'Email Sent',
                    department: 'Project Management',
                    user: project.pm,
                    userId: project.pmId,
                    createdAt: project.lastEmailedAt,
                    metadata: {
                        projectName: project.clientName,
                    },
                });
            }
            if (project.closedAt) {
                activities.push({
                    id: `project-closed-${project.id}`,
                    type: 'project',
                    action: 'Project Closed',
                    department: 'Project Management',
                    user: project.pm,
                    userId: project.pmId,
                    createdAt: project.closedAt,
                    metadata: {
                        projectName: project.clientName,
                    },
                });
            }
            const deliverables = await this.deliverablesRepository.find({
                where: { projectId },
                relations: ['project'],
            });
            for (const deliverable of deliverables) {
                const department = this.getDepartmentFromDeliverableType(deliverable.type);
                activities.push({
                    id: `deliverable-created-${deliverable.id}`,
                    type: 'deliverable',
                    action: 'Deliverable Created',
                    department,
                    user: null,
                    userId: null,
                    createdAt: deliverable.createdAt,
                    metadata: {
                        deliverableType: deliverable.type,
                        deliverableCustomType: deliverable.customType,
                        status: deliverable.status,
                    },
                });
                const deliverableHistory = await this.deliverableHistoryRepository.find({
                    where: { deliverableId: deliverable.id },
                    relations: ['user', 'deliverable'],
                    order: { createdAt: 'ASC' },
                });
                for (const history of deliverableHistory) {
                    activities.push({
                        id: `deliverable-${history.id}`,
                        type: 'deliverable',
                        action: String(history.action),
                        department,
                        user: history.user,
                        userId: history.userId,
                        createdAt: history.createdAt,
                        metadata: {
                            deliverableType: deliverable.type,
                            deliverableCustomType: deliverable.customType,
                            fileUrl: history.fileUrl,
                            previousStatus: history.previousStatus,
                            newStatus: history.newStatus,
                            notes: history.notes,
                        },
                    });
                }
                if (deliverable.fileUrl && deliverableHistory.length === 0 && deliverable.updatedAt) {
                    activities.push({
                        id: `deliverable-file-added-${deliverable.id}`,
                        type: 'deliverable',
                        action: 'File Added',
                        department,
                        user: null,
                        userId: null,
                        createdAt: deliverable.updatedAt,
                        metadata: {
                            deliverableType: deliverable.type,
                            deliverableCustomType: deliverable.customType,
                            fileUrl: deliverable.fileUrl,
                            status: deliverable.status,
                        },
                    });
                }
            }
            const tasks = await this.tasksRepository.find({
                where: { projectId },
                relations: ['assignedTo', 'project'],
                order: { createdAt: 'ASC' },
            });
            for (const task of tasks) {
                const department = this.getDepartmentFromTaskType(task.type);
                activities.push({
                    id: `task-created-${task.id}`,
                    type: 'task',
                    action: 'Task Created',
                    department,
                    user: task.assignedTo,
                    userId: task.assignedToId,
                    createdAt: task.createdAt,
                    metadata: {
                        taskTitle: task.title,
                        taskType: task.type,
                        status: task.status,
                    },
                });
                const taskFileHistory = await this.taskFileHistoryRepository.find({
                    where: { taskId: task.id },
                    relations: ['user', 'task'],
                    order: { createdAt: 'ASC' },
                });
                for (const history of taskFileHistory) {
                    activities.push({
                        id: `task-file-${history.id}`,
                        type: 'task',
                        action: String(history.action),
                        department,
                        user: history.user,
                        userId: history.userId,
                        createdAt: history.createdAt,
                        metadata: {
                            taskTitle: task.title,
                            taskType: task.type,
                            fileUrl: history.fileUrl,
                            notes: history.notes,
                        },
                    });
                }
                if (task.fileUrl && taskFileHistory.length === 0 && task.updatedAt) {
                    activities.push({
                        id: `task-submitted-${task.id}`,
                        type: 'task',
                        action: 'Submitted',
                        department,
                        user: task.assignedTo,
                        userId: task.assignedToId,
                        createdAt: task.updatedAt,
                        metadata: {
                            taskTitle: task.title,
                            taskType: task.type,
                            fileUrl: task.fileUrl,
                            status: task.status,
                        },
                    });
                }
                if (task.status === 'In Review' && task.fileUrl) {
                    activities.push({
                        id: `task-sent-for-review-${task.id}`,
                        type: 'task',
                        action: 'Sent for Review',
                        department,
                        user: task.assignedTo,
                        userId: task.assignedToId,
                        createdAt: task.updatedAt || task.createdAt,
                        metadata: {
                            taskTitle: task.title,
                            taskType: task.type,
                            fileUrl: task.fileUrl,
                            status: task.status,
                        },
                    });
                }
                if (task.updatedAt && task.updatedAt.getTime() !== task.createdAt.getTime() && !task.fileUrl) {
                    activities.push({
                        id: `task-updated-${task.id}`,
                        type: 'task',
                        action: 'Task Updated',
                        department,
                        user: task.assignedTo,
                        userId: task.assignedToId,
                        createdAt: task.updatedAt,
                        metadata: {
                            taskTitle: task.title,
                            taskType: task.type,
                            status: task.status,
                        },
                    });
                }
            }
            activities.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            console.log(`[ProjectsService] Returning ${activities.length} activities for project ${projectId}`);
            return activities;
        }
        catch (error) {
            console.error(`[ProjectsService] Error getting activity for project ${projectId}:`, error);
            console.error(`[ProjectsService] Error stack:`, error.stack);
            throw error;
        }
    }
    getDepartmentFromDeliverableType(type) {
        const typeStr = type.toString();
        if (typeStr.includes('Logo') || typeStr.includes('Social') || typeStr.includes('Landing Page') || typeStr.includes('Brand Book')) {
            return 'Design';
        }
        if (typeStr.includes('Copy') || typeStr.includes('Speaker Kit')) {
            return 'Copy Writing';
        }
        return 'General';
    }
    getDepartmentFromTaskType(type) {
        const typeStr = type.toString();
        if (typeStr === 'Design' || typeStr === 'DESIGN') {
            return 'Design';
        }
        if (typeStr === 'Copy' || typeStr === 'COPY') {
            return 'Copy Writing';
        }
        if (typeStr === 'Dev' || typeStr === 'DEV') {
            return 'Development';
        }
        if (typeStr === 'Onboarding' || typeStr === 'INTAKE') {
            return 'Onboarding';
        }
        return 'General';
    }
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(project_entity_1.Project)),
    __param(1, (0, typeorm_1.InjectRepository)(project_team_member_entity_1.ProjectTeamMember)),
    __param(2, (0, typeorm_1.InjectRepository)(task_entity_1.Task)),
    __param(3, (0, typeorm_1.InjectRepository)(deliverable_entity_1.Deliverable)),
    __param(4, (0, typeorm_1.InjectRepository)(deliverable_history_entity_1.DeliverableHistory)),
    __param(5, (0, typeorm_1.InjectRepository)(task_file_history_entity_1.TaskFileHistory)),
    __param(6, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService,
        auth_service_1.AuthService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map