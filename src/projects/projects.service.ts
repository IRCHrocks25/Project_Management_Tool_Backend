import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Project,
  ProjectStage,
  ClientType,
  PackageType,
  OnboardingPhase,
  OnboardingPhaseStatus,
} from './entities/project.entity';
import { ProjectTeamMember } from './entities/project-team-member.entity';
import { Task, TaskType, TaskStatus } from '../tasks/entities/task.entity';
import { Deliverable, DeliverableType, DeliverableStatus } from '../deliverables/entities/deliverable.entity';
import { DeliverableHistory } from '../deliverables/entities/deliverable-history.entity';
import { TaskFileHistory } from '../tasks/entities/task-file-history.entity';
import { User } from '../users/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectWebhookDto } from './dto/create-project-webhook.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateOnboardingPhaseDto } from './dto/update-onboarding-phase.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';

const ONBOARDING_PHASE_ORDER: OnboardingPhase[] = [
  OnboardingPhase.PAYMENT_CONFIRMED,
  OnboardingPhase.WELCOME_AND_CALL_BOOKING,
  OnboardingPhase.ONBOARDING_CALL,
  OnboardingPhase.CREDENTIAL_COLLECTION,
  OnboardingPhase.FOLLOW_UP_CALL,
  OnboardingPhase.SOFT_LAUNCH,
  OnboardingPhase.QA_MONITORING,
  OnboardingPhase.FULL_GO_LIVE,
];

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(ProjectTeamMember)
    private teamMembersRepository: Repository<ProjectTeamMember>,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(Deliverable)
    private deliverablesRepository: Repository<Deliverable>,
    @InjectRepository(DeliverableHistory)
    private deliverableHistoryRepository: Repository<DeliverableHistory>,
    @InjectRepository(TaskFileHistory)
    private taskFileHistoryRepository: Repository<TaskFileHistory>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
    private authService: AuthService,
  ) {}

  async create(createProjectDto: CreateProjectDto, userId: string) {
    // Determine initial stage: CRM if client type is Katalyst, Premium, or Powered-Up, otherwise INTAKE
    const allClientTypes = [
      createProjectDto.clientType,
      ...(createProjectDto.secondaryClientTypes || [])
    ];
    const isKatalyst = allClientTypes.some(type => 
      type === ClientType.KATALYST || String(type).toLowerCase() === 'katalyst'
    );
    const isPremiumOrPoweredUp = createProjectDto.clientType === ClientType.PREMIUM || 
                                  createProjectDto.clientType === ClientType.POWERED_UP;
    const initialStage = (isKatalyst || isPremiumOrPoweredUp) ? ProjectStage.CRM : ProjectStage.INTAKE;

    // Create project
    const project = this.projectsRepository.create({
      ...createProjectDto,
      secondaryClientTypes: createProjectDto.secondaryClientTypes?.map(t => t.toString()) || null,
      clientStartDate: createProjectDto.clientStartDate ? new Date(createProjectDto.clientStartDate) : null,
      pmId: createProjectDto.pmId || userId,
      stage: initialStage,
    });

    const savedProject = await this.projectsRepository.save(project);

    // Auto-generate deliverables based on package and client type
    const deliverables = this.generateDeliverables(
      savedProject.id, 
      createProjectDto.package, 
      createProjectDto.clientType,
      createProjectDto.customDeliverables
    );
    await this.deliverablesRepository.save(deliverables);

    // Auto-generate intake tasks
    const intakeTasks = this.generateIntakeTasks(savedProject.id);
    await this.tasksRepository.save(intakeTasks);

    // Load relations
    const projectWithRelations = await this.projectsRepository.findOne({
      where: { id: savedProject.id },
      relations: ['tasks', 'deliverables', 'pm'],
    });

    return projectWithRelations;
  }

  async createFromWebhook(webhookDto: CreateProjectWebhookDto) {
    // Get or create webhook PM account if pmId not provided
    let pmId = webhookDto.pmId;
    if (!pmId) {
      const webhookPM = await this.authService.getOrCreateWebhookPM();
      pmId = webhookPM.id;
      console.log(`[Webhook] Using webhook PM account: ${pmId} (${webhookPM.name})`);
    }

    // Log webhook project creation for audit purposes
    console.log(`[Webhook] Creating project: ${webhookDto.clientName} (${webhookDto.clientType}) - Package: ${webhookDto.package}, PM: ${pmId}, Source: ${webhookDto.sourceEmail || 'unknown'}`);

    // Convert webhook DTO to regular DTO format
    const createProjectDto: CreateProjectDto = {
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

    // Use the existing create method with the webhook's pmId
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

  private generateDeliverables(projectId: string, packageType: PackageType, clientType: ClientType, customDeliverables?: string[]): Deliverable[] {
    const deliverables: Deliverable[] = [];

    // If Custom package, use the provided custom deliverables list
    if (packageType === PackageType.CUSTOM && customDeliverables && customDeliverables.length > 0) {
      const deliverableTypeMap: Record<string, DeliverableType> = {
        'Logo': DeliverableType.LOGO,
        'Brand Book': DeliverableType.BRAND_BOOK,
        'Home Page': DeliverableType.LANDING_PAGE,
        'Copy of Home Page': DeliverableType.COPY_OF_LANDING_PAGE,
        'Speaker Kit': DeliverableType.SPEAKER_KIT,
        'Social Banners': DeliverableType.SOCIAL_BANNERS,
        'Other': DeliverableType.OTHER,
      };

      for (const deliverableName of customDeliverables) {
        const deliverableType = deliverableTypeMap[deliverableName];
        if (deliverableType) {
          deliverables.push({
            projectId,
            type: deliverableType,
            status: DeliverableStatus.NOT_STARTED,
          } as Deliverable);
        }
      }

      return deliverables;
    }

    // Standard package logic for non-custom packages
    // All packages include Logo
    deliverables.push({
      projectId,
      type: DeliverableType.LOGO,
      status: DeliverableStatus.NOT_STARTED,
    } as Deliverable);

    // All packages include Brand Book
    deliverables.push({
      projectId,
      type: DeliverableType.BRAND_BOOK,
      status: DeliverableStatus.NOT_STARTED,
    } as Deliverable);

    // ICON clients always get Speaker Kit
    if (clientType === ClientType.ICON) {
      deliverables.push({
        projectId,
        type: DeliverableType.SPEAKER_KIT,
        status: DeliverableStatus.NOT_STARTED,
      } as Deliverable);
    }

    // Premium packages include Home Page
    if (packageType === PackageType.PREMIUM || packageType === PackageType.ICON_PACKAGE) {
      deliverables.push({
        projectId,
        type: DeliverableType.LANDING_PAGE,
        status: DeliverableStatus.NOT_STARTED,
      } as Deliverable);
    }

    // Standard and above include Social Banners
    if (packageType !== PackageType.STARTER) {
      deliverables.push({
        projectId,
        type: DeliverableType.SOCIAL_BANNERS,
        status: DeliverableStatus.NOT_STARTED,
      } as Deliverable);
    }

    return deliverables;
  }

  private generateIntakeTasks(projectId: string): Partial<Task>[] {
    return [
      {
        projectId,
        title: 'CMD',
        description: 'Submit CMD information (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Branding Questionnaire',
        description: 'Submit branding questionnaire (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Laundry List',
        description: 'Submit laundry list (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Branding Agreement',
        description: 'Submit branding agreement (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Hosting Credentials & Domain',
        description: 'Submit hosting credentials and domain information (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Privacy Policy, Terms and Conditions, Cookiebot',
        description: 'Submit privacy policy, terms and conditions, and Cookiebot information (URL or text)',
        type: TaskType.INTAKE,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
    ];
  }

  async findAll(userId: string, userRole: string, includeArchived: boolean = false) {
    try {
      const queryBuilder = this.projectsRepository
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.pm', 'pm')
        .leftJoinAndSelect('project.deliverables', 'deliverables')
        .leftJoinAndSelect('project.emails', 'emails')
        .leftJoinAndSelect('project.teamMembers', 'teamMembers')
        .leftJoinAndSelect('teamMembers.user', 'teamMemberUser');

      // Role-based filtering
      if (userRole === 'Project Manager') {
        queryBuilder.where('project.pmId = :userId', { userId });
      }

      // Exclude archived and completed projects by default (soft-hide pattern)
      if (!includeArchived) {
        if (userRole === 'Project Manager') {
          queryBuilder.andWhere('project.isArchived = :isArchived', { isArchived: false });
          queryBuilder.andWhere('project.isCompleted = :isCompleted', { isCompleted: false });
        } else {
          queryBuilder.where('project.isArchived = :isArchived', { isArchived: false });
          queryBuilder.andWhere('project.isCompleted = :isCompleted', { isCompleted: false });
        }
      }

      const projects = await queryBuilder.orderBy('project.createdAt', 'DESC').getMany();

      // Load tasks separately to handle enum mismatch gracefully
      for (const project of projects) {
        try {
          project.tasks = await this.tasksRepository.find({
            where: { projectId: project.id, isArchived: false },
            relations: ['assignedTo'],
          });
          // Fix any tasks with old "Intake" enum value
          for (const task of project.tasks) {
            if (task.type === 'Intake' as any) {
              task.type = TaskType.INTAKE;
              await this.tasksRepository.save(task);
            }
          }
          
          // If project is in Onboarding stage and has no onboarding tasks, create them
          if (project.stage === ProjectStage.INTAKE) {
            const onboardingTasks = project.tasks.filter((t: any) => t.type === TaskType.INTAKE || t.type === 'Onboarding');
            if (onboardingTasks.length === 0) {
              console.log(`[ProjectsService] No onboarding tasks found for project ${project.id} (${project.clientName}) in findAll, creating them...`);
              try {
                const newTasks = this.generateIntakeTasks(project.id);
                const savedTasks = await this.tasksRepository.save(newTasks);
                project.tasks = [...project.tasks, ...savedTasks];
                console.log(`[ProjectsService] Created ${savedTasks.length} onboarding tasks for project ${project.id}`);
              } catch (createError) {
                console.error(`[ProjectsService] Error creating onboarding tasks for project ${project.id}:`, createError);
              }
            }
          }
        } catch (error) {
          console.error(`Error loading tasks for project ${project.id}:`, error);
          project.tasks = [];
        }

        // Check if Home Page design files are approved and move to Dev if needed
        await this.checkAndMoveToDevelopment(project);
      }

      return projects;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw error;
    }
  }

  async findOne(id: string) {
    try {
      console.log(`[ProjectsService] Finding project with ID: ${id}`);
      const project = await this.projectsRepository.findOne({
        where: { id },
        relations: ['pm', 'deliverables', 'emails', 'emails.sentBy', 'teamMembers', 'teamMembers.user'],
      });

      console.log(`[ProjectsService] Project found:`, project ? `Yes (${project.clientName})` : 'No');

      if (!project) {
        console.log(`[ProjectsService] Project not found for ID: ${id}`);
        throw new NotFoundException(`Project not found with ID: ${id}`);
      }

      // Load tasks separately to handle enum mismatch
      // Note: findOne still returns archived projects (for direct links), but filters out archived tasks
      try {
        project.tasks = await this.tasksRepository.find({
          where: { projectId: id, isArchived: false },
          relations: ['assignedTo'],
        });
        console.log(`[ProjectsService] Loaded ${project.tasks.length} tasks for project ${id}`);
        
        // Fix any tasks with old "Intake" enum value
        for (const task of project.tasks) {
          if (task.type === 'Intake' as any) {
            task.type = TaskType.INTAKE;
            await this.tasksRepository.save(task);
          }
        }
        
        // If project is in Onboarding stage and has no onboarding tasks, create them automatically
        if (project.stage === ProjectStage.INTAKE) {
          const onboardingTasks = project.tasks.filter((t: any) => t.type === TaskType.INTAKE || t.type === 'Onboarding' || t.type === 'Intake');
          if (onboardingTasks.length === 0) {
            console.log(`[ProjectsService] No onboarding tasks found for project ${id}, creating them automatically...`);
            try {
              const intakeTasks = this.generateIntakeTasks(id);
              const savedTasks: Task[] = [];
              
              // Check enum values once
              let enumValue = 'Onboarding';
              try {
                const enumCheck = await this.tasksRepository.manager.query(
                  `SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value`
                );
                const hasOnboarding = enumCheck.some((e: any) => e.enum_value === 'Onboarding');
                if (!hasOnboarding) {
                  console.log(`[ProjectsService] 'Onboarding' not in enum, will use 'Intake' and update`);
                  enumValue = 'Intake';
                }
              } catch (enumError) {
                console.log(`[ProjectsService] Could not check enum, defaulting to 'Onboarding'`);
              }
              
              // Save all tasks using raw SQL for reliability
              for (const taskData of intakeTasks) {
                try {
                  const result = await this.tasksRepository.manager.query(
                    `INSERT INTO tasks (id, "projectId", title, description, type, status, "isCompleted", "createdAt", "updatedAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                     RETURNING id`,
                    [id, taskData.title, taskData.description || null, enumValue, 'Todo', false]
                  );
                  
                  if (result && result.length > 0) {
                    // If we used 'Intake', try to update to 'Onboarding'
                    if (enumValue === 'Intake') {
                      try {
                        await this.tasksRepository.manager.query(
                          `UPDATE tasks SET type = 'Onboarding' WHERE id = $1 AND type = 'Intake'`,
                          [result[0].id]
                        );
                      } catch (updateError) {
                        // If update fails, that's okay - 'Intake' will work too
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
                } catch (taskError: any) {
                  console.error(`[ProjectsService] Failed to create task ${taskData.title}:`, taskError.message);
                }
              }
              
              // Reload all tasks to include the newly created ones
              const allTasks = await this.tasksRepository.find({
                where: { projectId: id },
                relations: ['assignedTo'],
              });
              
              // Fix enum values for any tasks that might have 'Intake'
              for (const task of allTasks) {
                if (task.type === 'Intake' as any) {
                  task.type = TaskType.INTAKE;
                  await this.tasksRepository.save(task);
                }
              }
              
              project.tasks = allTasks;
              console.log(`[ProjectsService] Auto-created ${savedTasks.length} onboarding tasks. Total tasks now: ${project.tasks.length}`);
            } catch (createError: any) {
              console.error(`[ProjectsService] Error auto-creating onboarding tasks:`, createError.message);
            }
          } else {
            console.log(`[ProjectsService] Project ${id} already has ${onboardingTasks.length} onboarding tasks`);
          }
        }
      } catch (error) {
        console.error(`[ProjectsService] Error loading tasks for project ${id}:`, error);
        project.tasks = [];
      }

      // Check if Home Page design files are approved and move to Dev if needed
      await this.checkAndMoveToDevelopment(project);

      return project;
    } catch (error) {
      console.error('Error in findOne:', error);
      throw error;
    }
  }

  private async checkAndMoveToDevelopment(project: Project) {
    try {
      // Only check if project is in Design or Design Revision stage
      if (project.stage !== ProjectStage.DESIGN && project.stage !== ProjectStage.DESIGN_REVISION) {
        return;
      }

      // Find Home Page deliverable
      const landingPageDeliverable = project.deliverables?.find(
        (d: any) => d.type === DeliverableType.LANDING_PAGE
      );

      if (!landingPageDeliverable) {
        return;
      }

      // Get all tasks for this project
      const allTasks = await this.tasksRepository.find({
        where: { projectId: project.id },
      });

      // Find design tasks with fileUrls (Figma links)
      const designTasks = allTasks.filter(
        (t: any) => t.type === TaskType.DESIGN && t.fileUrl && (t.fileUrl.includes('figma.com') || t.fileUrl.includes('figma'))
      );

      if (designTasks.length === 0) {
        return;
      }

      // Check deliverable history to see if all design files are approved
      const { DeliverableHistory } = await import('../deliverables/entities/deliverable-history.entity');
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

      // If all design files are approved, move project to Development
      if (allDesignFilesApproved) {
        project.stage = ProjectStage.DEV;
        await this.projectsRepository.save(project);
        console.log(`[ProjectsService] Moved project ${project.id} (${project.clientName}) to Development stage - all Home Page design files are approved`);
      }
    } catch (error) {
      console.error('[ProjectsService] Error checking Home Page design approval:', error);
    }
  }

  async updateStage(id: string, updateStageDto: UpdateProjectStageDto) {
    const project = await this.findOne(id);
    const previousStage = project.stage;

    // Increment revision count if moving to revision stage
    if (updateStageDto.stage === ProjectStage.COPY_REVISION) {
      project.copyRevisionCount += 1;
    }
    if (updateStageDto.stage === ProjectStage.DESIGN_REVISION) {
      project.designRevisionCount += 1;
    }

    project.stage = updateStageDto.stage;
    const savedProject = await this.projectsRepository.save(project);

    // Auto-create Copy tasks when moving to Copy stage
    if (updateStageDto.stage === ProjectStage.COPY && previousStage !== ProjectStage.COPY) {
      const copyTasks = this.generateCopyTasks(savedProject.id);
      await this.tasksRepository.save(copyTasks);
    }

    // Create notification for PM
    try {
      await this.notificationsService.createProjectStageChangedNotification(
        project.pmId,
        project.id,
        project.clientName,
        updateStageDto.stage,
      );
    } catch (error) {
      console.error('Failed to create notification:', error);
    }

    return savedProject;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto) {
    const project = await this.findOne(id);
    
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    // Update client name if provided
    if (updateProjectDto.clientName !== undefined) {
      project.clientName = updateProjectDto.clientName;
    }

    // Update client type if provided
    if (updateProjectDto.clientType !== undefined) {
      project.clientType = updateProjectDto.clientType;
    }

    // Update secondary client types if provided
    if (updateProjectDto.secondaryClientTypes !== undefined) {
      project.secondaryClientTypes = updateProjectDto.secondaryClientTypes.map(t => t.toString()) || null;
    }

    // Update PM if provided
    if (updateProjectDto.pmId !== undefined) {
      // Verify the PM user exists and is a Project Manager
      const pmUser = await this.usersRepository.findOne({ where: { id: updateProjectDto.pmId } });
      if (!pmUser) {
        throw new NotFoundException(`User with ID ${updateProjectDto.pmId} not found`);
      }
      if (pmUser.role !== 'Project Manager') {
        throw new BadRequestException(`User ${pmUser.name} is not a Project Manager`);
      }
      project.pmId = updateProjectDto.pmId;
      project.pm = pmUser; // Sync relation so TypeORM save() doesn't overwrite with stale pm
      console.log(`[ProjectsService] Updated project ${id} pmId to ${updateProjectDto.pmId} (${pmUser.name})`);
    }

    // Update associated project link if provided
    if (updateProjectDto.associatedLink !== undefined) {
      const normalizedLink = updateProjectDto.associatedLink.trim();
      project.associatedLink = normalizedLink || undefined;
    }

    // Check if Katalyst is in client types (primary or secondary) and update stage to CRM if needed
    const allClientTypes = [
      project.clientType,
      ...(project.secondaryClientTypes || [])
    ];
    const isKatalyst = allClientTypes.some(type => 
      type === ClientType.KATALYST || String(type).toLowerCase() === 'katalyst'
    );
    
    // If Katalyst is present and project is not already in CRM or later stages, move to CRM
    if (isKatalyst && project.stage !== ProjectStage.CRM && 
        project.stage !== ProjectStage.READY_TO_CLOSE && 
        project.stage !== ProjectStage.CLOSED) {
      project.stage = ProjectStage.CRM;
    }

    return await this.projectsRepository.save(project);
  }

  private generateCopyTasks(projectId: string): Task[] {
    return [
      {
        projectId,
        title: 'Write Copy',
        description: 'Create all copy content for the project',
        type: TaskType.COPY,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
      {
        projectId,
        title: 'Review Copy',
        description: 'Review and refine copy content',
        type: TaskType.COPY,
        status: TaskStatus.TODO,
        isCompleted: false,
      },
    ] as Task[];
  }

  async updateLastEmailed(id: string) {
    const project = await this.findOne(id);
    project.lastEmailedAt = new Date();
    return this.projectsRepository.save(project);
  }

  async generateOnboardingTasks(id: string) {
    try {
      console.log(`[ProjectsService] generateOnboardingTasks called for project ${id}`);
      const project = await this.projectsRepository.findOne({ where: { id } });
      if (!project) {
        console.log(`[ProjectsService] Project not found: ${id}`);
        throw new NotFoundException('Project not found');
      }

      console.log(`[ProjectsService] Project found: ${project.clientName}, stage: ${project.stage}`);

      // Check if onboarding tasks already exist (check both enum value and string)
      const existingTasks = await this.tasksRepository.find({
        where: { projectId: id },
      });
      
      const onboardingTasks = existingTasks.filter((t: any) => 
        t.type === TaskType.INTAKE || t.type === 'Onboarding' || t.type === 'Intake'
      );

      console.log(`[ProjectsService] Found ${onboardingTasks.length} existing onboarding tasks out of ${existingTasks.length} total tasks`);

      if (onboardingTasks.length > 0) {
        console.log(`[ProjectsService] Onboarding tasks already exist, returning them`);
        return { message: 'Onboarding tasks already exist', tasks: onboardingTasks };
      }

      // Generate and save onboarding tasks
      console.log(`[ProjectsService] Generating ${6} onboarding tasks...`);
      const intakeTasks = this.generateIntakeTasks(id);
      console.log(`[ProjectsService] Generated tasks:`, intakeTasks.map((t: any) => ({ title: t.title, type: t.type })));
      
      // Use raw SQL to insert tasks, bypassing enum type checking issues
      const savedTasks: Task[] = [];
      for (const taskData of intakeTasks) {
        try {
          // First try normal TypeORM save
          try {
            const task = this.tasksRepository.create(taskData);
            const saved = await this.tasksRepository.save(task);
            savedTasks.push(saved);
            console.log(`[ProjectsService] Saved task via TypeORM: ${saved.title} (${saved.id})`);
          } catch (typeormError: any) {
            // If TypeORM fails (likely enum issue), use raw SQL
            console.log(`[ProjectsService] TypeORM save failed, trying raw SQL for ${taskData.title}:`, typeormError.message);
            
            try {
              // Use raw SQL without enum casting - let PostgreSQL handle it
              // First check what enum values exist
              const enumCheck = await this.tasksRepository.manager.query(
                `SELECT unnest(enum_range(NULL::tasks_type_enum))::text as enum_value`
              );
              console.log(`[ProjectsService] Available enum values:`, enumCheck.map((e: any) => e.enum_value));
              
              // Try inserting with 'Onboarding' first
              let enumValue = 'Onboarding';
              const hasOnboarding = enumCheck.some((e: any) => e.enum_value === 'Onboarding');
              if (!hasOnboarding) {
                console.log(`[ProjectsService] 'Onboarding' not in enum, using 'Intake' instead`);
                enumValue = 'Intake';
              }
              
              const result = await this.tasksRepository.manager.query(
                `INSERT INTO tasks (id, "projectId", title, description, type, status, "isCompleted", "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                 RETURNING id`,
                [
                  id,
                  taskData.title,
                  taskData.description || null,
                  enumValue,
                  'Todo',
                  taskData.isCompleted || false,
                ]
              );
              
              if (result && result.length > 0) {
                // If we used 'Intake', update it to 'Onboarding' if possible
                if (enumValue === 'Intake' && hasOnboarding) {
                  try {
                    await this.tasksRepository.manager.query(
                      `UPDATE tasks SET type = 'Onboarding' WHERE id = $1`,
                      [result[0].id]
                    );
                  } catch (updateError) {
                    console.log(`[ProjectsService] Could not update to 'Onboarding', keeping 'Intake'`);
                  }
                }
                
                // Load the full task with relations
                const savedTask = await this.tasksRepository.findOne({
                  where: { id: result[0].id },
                  relations: ['assignedTo'],
                });
                if (savedTask) {
                  savedTasks.push(savedTask);
                  console.log(`[ProjectsService] Saved task via raw SQL: ${savedTask.title} (${savedTask.id})`);
                }
              }
            } catch (sqlError: any) {
              console.error(`[ProjectsService] Raw SQL failed for ${taskData.title}:`, sqlError.message);
              console.error(`[ProjectsService] SQL error code:`, sqlError.code);
              console.error(`[ProjectsService] SQL error detail:`, sqlError.detail);
            }
          }
        } catch (taskError: any) {
          console.error(`[ProjectsService] Error saving task ${taskData.title}:`, taskError);
          console.error(`[ProjectsService] Task error details:`, taskError.message, taskError.stack);
          // Continue with other tasks even if one fails
        }
      }

      console.log(`[ProjectsService] Successfully created ${savedTasks.length} onboarding tasks`);
      return { message: 'Onboarding tasks created successfully', tasks: savedTasks };
    } catch (error: any) {
      console.error(`[ProjectsService] Error generating onboarding tasks for project ${id}:`, error);
      console.error(`[ProjectsService] Error details:`, error.message, error.stack);
      throw error;
    }
  }

  async closeProject(id: string) {
    const project = await this.findOne(id);
    project.stage = ProjectStage.CLOSED;
    project.closedAt = new Date();
    return this.projectsRepository.save(project);
  }

  async archiveProject(id: string, userId?: string) {
    // Use transaction to ensure atomicity
    return await this.projectsRepository.manager.transaction(async (transactionalEntityManager) => {
      // Find project (this will still work even if archived, for direct links)
      const project = await transactionalEntityManager.findOne(Project, {
        where: { id },
      });

      if (!project) {
        throw new NotFoundException(`Project not found with ID: ${id}`);
      }

      if (project.isArchived) {
        // Already archived, return as-is
        return project;
      }

      // Update project: set archived flag, timestamp, and user
      project.isArchived = true;
      project.archivedAt = new Date();
      if (userId) {
        project.archivedByUserId = userId;
      }

      // Save project first
      await transactionalEntityManager.save(Project, project);

      // Bulk update all tasks for this project (much faster than looping)
      await transactionalEntityManager.update(
        Task,
        { projectId: id },
        { isArchived: true },
      );

      return project;
    });
  }

  async completeProject(id: string, userId?: string) {
    try {
      // Use transaction to ensure atomicity
      return await this.projectsRepository.manager.transaction(async (transactionalEntityManager) => {
        // Find project (this will still work even if completed, for direct links)
        const project = await transactionalEntityManager.findOne(Project, {
          where: { id },
        });

        if (!project) {
          throw new NotFoundException(`Project not found with ID: ${id}`);
        }

        if (project.isCompleted) {
          // Already completed, return as-is
          return project;
        }

        // Update project: set completed flag, timestamp, and user
        project.isCompleted = true;
        project.completedAt = new Date();
        if (userId) {
          project.completedByUserId = userId;
        }

        // Save project
        await transactionalEntityManager.save(Project, project);

        console.log(`[ProjectsService] Project ${id} marked as complete by user ${userId}`);
        return project;
      });
    } catch (error: any) {
      console.error(`[ProjectsService] Error completing project ${id}:`, error);
      console.error(`[ProjectsService] Error details:`, error.message, error.stack);
      throw error;
    }
  }

  async getCompletedProjects(userId: string, userRole: string) {
    try {
      const queryBuilder = this.projectsRepository
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.pm', 'pm')
        .leftJoinAndSelect('project.deliverables', 'deliverables')
        .leftJoinAndSelect('project.emails', 'emails')
        .leftJoinAndSelect('project.teamMembers', 'teamMembers')
        .leftJoinAndSelect('teamMembers.user', 'teamMemberUser')
        .where('project.isCompleted = :isCompleted', { isCompleted: true });

      // Role-based filtering
      if (userRole === 'Project Manager') {
        queryBuilder.andWhere('project.pmId = :userId', { userId });
      }

      const projects = await queryBuilder.orderBy('project.completedAt', 'DESC').getMany();

      // Load tasks separately
      for (const project of projects) {
        try {
          project.tasks = await this.tasksRepository.find({
            where: { projectId: project.id, isArchived: false },
            relations: ['assignedTo'],
          });
        } catch (error) {
          console.error(`Error loading tasks for project ${project.id}:`, error);
          project.tasks = [];
        }
      }

      return projects;
    } catch (error) {
      console.error('Error in getCompletedProjects:', error);
      throw error;
    }
  }

  async getStats(userId: string, userRole: string) {
    const queryBuilder = this.projectsRepository.createQueryBuilder('project');

    // Exclude archived projects from stats
    if (userRole === 'Project Manager') {
      queryBuilder.where('project.pmId = :userId', { userId })
        .andWhere('project.isArchived = :isArchived', { isArchived: false });
    } else {
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
    } else {
      overdueQueryBuilder.where('project.isArchived = :isArchived', { isArchived: false });
    }
    const overdue = await overdueQueryBuilder
      .andWhere('project.lastEmailedAt < :fiveDaysAgo', {
        fiveDaysAgo: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      })
      .andWhere('project.stage IN (:...waitingStages)', {
        waitingStages: [ProjectStage.COPY_REVISION, ProjectStage.DESIGN_REVISION],
      })
      .getCount();

    return {
      total,
      byStage,
      overdue,
    };
  }

  async getRapidProspectProjects(userId: string, userRole: string) {
    const queryBuilder = this.projectsRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.pm', 'pm')
      .where('project.clientType = :clientType', { clientType: ClientType.RAPID_PROSPECT })
      .andWhere('project.isArchived = :isArchived', { isArchived: false })
      .andWhere('project.isCompleted = :isCompleted', { isCompleted: false });

    if (userRole === 'Project Manager') {
      queryBuilder.andWhere('project.pmId = :userId', { userId });
    }

    return queryBuilder.orderBy('project.updatedAt', 'DESC').getMany();
  }

  async updateOnboardingPhase(projectId: string, dto: UpdateOnboardingPhaseDto, actorUserId?: string) {
    const project = await this.findOne(projectId);

    if (project.clientType !== ClientType.RAPID_PROSPECT) {
      throw new BadRequestException('Onboarding phase updates are only available for Rapid Prospect clients');
    }

    if (dto.onboardingManagerId !== undefined) {
      project.onboardingManagerId = dto.onboardingManagerId;
    }
    if (dto.automationSpecialistId !== undefined) {
      project.automationSpecialistId = dto.automationSpecialistId;
    }
    if (dto.qaSpecialistId !== undefined) {
      project.qaSpecialistId = dto.qaSpecialistId;
    }

    const currentPhase = project.onboardingPhase || OnboardingPhase.WELCOME_AND_CALL_BOOKING;
    let targetPhase = dto.phase || currentPhase;

    if (dto.advanceToNextPhase) {
      targetPhase = this.getNextOnboardingPhase(currentPhase);
    }

    const currentIndex = ONBOARDING_PHASE_ORDER.indexOf(currentPhase);
    const targetIndex = ONBOARDING_PHASE_ORDER.indexOf(targetPhase);
    if (currentIndex >= 0 && targetIndex > currentIndex + 1) {
      throw new BadRequestException('Phase progression can only move one step at a time');
    }

    project.onboardingPhase = targetPhase;
    project.onboardingPhaseStatus =
      dto.status || (targetPhase === OnboardingPhase.FULL_GO_LIVE ? OnboardingPhaseStatus.COMPLETED : OnboardingPhaseStatus.IN_PROGRESS);
    project.onboardingStartedAt = project.onboardingStartedAt || new Date();

    const milestoneKey = dto.milestoneKey || this.phaseToMilestoneKey(targetPhase);
    const nowIso = new Date().toISOString();
    const milestones = { ...(project.onboardingMilestones || {}) };
    const existingMilestone = milestones[milestoneKey] || { completed: false };

    if (dto.markCurrentMilestoneComplete || project.onboardingPhaseStatus === OnboardingPhaseStatus.COMPLETED) {
      milestones[milestoneKey] = {
        ...existingMilestone,
        completed: true,
        completedAt: existingMilestone.completedAt || nowIso,
        ownerUserId: dto.ownerUserId || existingMilestone.ownerUserId || actorUserId,
        notes: dto.notes || existingMilestone.notes,
      };
    } else {
      milestones[milestoneKey] = {
        ...existingMilestone,
        ownerUserId: dto.ownerUserId || existingMilestone.ownerUserId || actorUserId,
        notes: dto.notes || existingMilestone.notes,
      };
    }

    if (project.onboardingPhase === OnboardingPhase.FULL_GO_LIVE && project.onboardingPhaseStatus === OnboardingPhaseStatus.COMPLETED) {
      project.onboardingCompletedAt = new Date();
    }

    project.onboardingMilestones = milestones;
    return this.projectsRepository.save(project);
  }

  private getNextOnboardingPhase(phase: OnboardingPhase): OnboardingPhase {
    const idx = ONBOARDING_PHASE_ORDER.indexOf(phase);
    if (idx < 0 || idx === ONBOARDING_PHASE_ORDER.length - 1) {
      return phase;
    }
    return ONBOARDING_PHASE_ORDER[idx + 1];
  }

  private phaseToMilestoneKey(phase: OnboardingPhase): string {
    const keyMap: Record<OnboardingPhase, string> = {
      [OnboardingPhase.PAYMENT_CONFIRMED]: 'paymentConfirmed',
      [OnboardingPhase.WELCOME_AND_CALL_BOOKING]: 'welcomeAndCallBooking',
      [OnboardingPhase.ONBOARDING_CALL]: 'onboardingCall',
      [OnboardingPhase.CREDENTIAL_COLLECTION]: 'credentialCollection',
      [OnboardingPhase.FOLLOW_UP_CALL]: 'followUpCall',
      [OnboardingPhase.SOFT_LAUNCH]: 'softLaunch',
      [OnboardingPhase.QA_MONITORING]: 'qaMonitoring',
      [OnboardingPhase.FULL_GO_LIVE]: 'fullGoLive',
    };
    return keyMap[phase];
  }

  async addTeamMember(projectId: string, userId: string) {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if member already exists
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

  async removeTeamMember(projectId: string, userId: string) {
    const result = await this.teamMembersRepository.delete({
      projectId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Team member not found');
    }

    return { success: true };
  }

  async getTeamMembers(projectId: string) {
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

  async getActivity(projectId: string) {
    try {
      console.log(`[ProjectsService] Getting activity for project: ${projectId}`);
      const project = await this.findOne(projectId);
      if (!project) {
        console.error(`[ProjectsService] Project not found: ${projectId}`);
        return [];
      }
      const activities: any[] = [];

      // Project creation
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

      // Project stage changes (we'll track these from project updates)
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

      // Get all deliverables for this project
      const deliverables = await this.deliverablesRepository.find({
        where: { projectId },
        relations: ['project'],
      });

      // Get deliverable history and creation
      for (const deliverable of deliverables) {
      const department = this.getDepartmentFromDeliverableType(deliverable.type);
      
      // Add deliverable creation as activity
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

      // Get deliverable history (status changes, approvals, revisions)
      const deliverableHistory = await this.deliverableHistoryRepository.find({
        where: { deliverableId: deliverable.id },
        relations: ['user', 'deliverable'],
        order: { createdAt: 'ASC' },
      });

      for (const history of deliverableHistory) {
        activities.push({
          id: `deliverable-${history.id}`,
          type: 'deliverable',
          action: String(history.action), // Ensure it's a string
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

      // If deliverable has fileUrl but no history entry, add it as activity
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

      // Get all tasks for this project
      const tasks = await this.tasksRepository.find({
        where: { projectId },
        relations: ['assignedTo', 'project'],
        order: { createdAt: 'ASC' },
      });

      // Task creation
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

      // Task file history (submissions from TaskFileHistory table)
      const taskFileHistory = await this.taskFileHistoryRepository.find({
        where: { taskId: task.id },
        relations: ['user', 'task'],
        order: { createdAt: 'ASC' },
      });

      for (const history of taskFileHistory) {
        activities.push({
          id: `task-file-${history.id}`,
          type: 'task',
          action: String(history.action), // Ensure it's a string
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

      // If task has fileUrl but no TaskFileHistory entry, treat it as a submission
      // Use updatedAt as the submission time (when fileUrl was likely added)
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

      // Track status changes
      if (task.status === 'In Review' && task.fileUrl) {
        // Task was sent for review
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

      // Task updates (if updatedAt is different from createdAt and not already covered)
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

      // Sort by date (oldest first - newest at bottom)
      activities.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      console.log(`[ProjectsService] Returning ${activities.length} activities for project ${projectId}`);
      return activities;
    } catch (error: any) {
      console.error(`[ProjectsService] Error getting activity for project ${projectId}:`, error);
      console.error(`[ProjectsService] Error stack:`, error.stack);
      throw error;
    }
  }

  private getDepartmentFromDeliverableType(type: DeliverableType | string): string {
    const typeStr = type.toString();
    if (typeStr.includes('Logo') || typeStr.includes('Social') || typeStr.includes('Home Page') || typeStr.includes('Brand Book')) {
      return 'Design';
    }
    if (typeStr.includes('Copy') || typeStr.includes('Speaker Kit')) {
      return 'Copy Writing';
    }
    return 'General';
  }

  private getDepartmentFromTaskType(type: TaskType | string): string {
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
}

