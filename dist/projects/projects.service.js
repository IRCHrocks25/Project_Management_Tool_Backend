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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const project_entity_1 = require("./entities/project.entity");
const project_team_member_entity_1 = require("./entities/project-team-member.entity");
const task_entity_1 = require("../tasks/entities/task.entity");
const deliverable_entity_1 = require("../deliverables/entities/deliverable.entity");
const notifications_service_1 = require("../notifications/notifications.service");
let ProjectsService = class ProjectsService {
    constructor(projectsRepository, teamMembersRepository, tasksRepository, deliverablesRepository, notificationsService) {
        this.projectsRepository = projectsRepository;
        this.teamMembersRepository = teamMembersRepository;
        this.tasksRepository = tasksRepository;
        this.deliverablesRepository = deliverablesRepository;
        this.notificationsService = notificationsService;
    }
    async create(createProjectDto, userId) {
        const project = this.projectsRepository.create({
            ...createProjectDto,
            pmId: createProjectDto.pmId || userId,
            stage: project_entity_1.ProjectStage.INTAKE,
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
    async findAll(userId, userRole) {
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
            const projects = await queryBuilder.orderBy('project.createdAt', 'DESC').getMany();
            for (const project of projects) {
                try {
                    project.tasks = await this.tasksRepository.find({
                        where: { projectId: project.id },
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
                    where: { projectId: id },
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
            const { DeliverableHistory } = await Promise.resolve().then(() => require('../deliverables/entities/deliverable-history.entity'));
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
    async getStats(userId, userRole) {
        const queryBuilder = this.projectsRepository.createQueryBuilder('project');
        if (userRole === 'Project Manager') {
            queryBuilder.where('project.pmId = :userId', { userId });
        }
        const total = await queryBuilder.getCount();
        const byStage = await queryBuilder
            .select('project.stage', 'stage')
            .addSelect('COUNT(*)', 'count')
            .groupBy('project.stage')
            .getRawMany();
        const overdue = await queryBuilder
            .where('project.lastEmailedAt < :fiveDaysAgo', {
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
};
exports.ProjectsService = ProjectsService;
exports.ProjectsService = ProjectsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(project_entity_1.Project)),
    __param(1, (0, typeorm_1.InjectRepository)(project_team_member_entity_1.ProjectTeamMember)),
    __param(2, (0, typeorm_1.InjectRepository)(task_entity_1.Task)),
    __param(3, (0, typeorm_1.InjectRepository)(deliverable_entity_1.Deliverable)),
    __param(4, (0, common_1.Inject)((0, common_1.forwardRef)(() => notifications_service_1.NotificationsService))),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService])
], ProjectsService);
//# sourceMappingURL=projects.service.js.map