import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project, ProjectStage, ClientType, PackageType } from './entities/project.entity';
import { ProjectTeamMember } from './entities/project-team-member.entity';
import { Task, TaskType, TaskStatus } from '../tasks/entities/task.entity';
import { Deliverable, DeliverableType, DeliverableStatus } from '../deliverables/entities/deliverable.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectWebhookDto } from './dto/create-project-webhook.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';

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
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
    private authService: AuthService,
  ) {}

  async create(createProjectDto: CreateProjectDto, userId: string) {
    // Create project
    const project = this.projectsRepository.create({
      ...createProjectDto,
      pmId: createProjectDto.pmId || userId,
      stage: ProjectStage.INTAKE,
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
        'Landing Page': DeliverableType.LANDING_PAGE,
        'Copy of Landing Page': DeliverableType.COPY_OF_LANDING_PAGE,
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

    // Premium packages include Landing Page
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

  async findAll(userId: string, userRole: string) {
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

      const projects = await queryBuilder.orderBy('project.createdAt', 'DESC').getMany();

      // Load tasks separately to handle enum mismatch gracefully
      for (const project of projects) {
        try {
          project.tasks = await this.tasksRepository.find({
            where: { projectId: project.id },
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

        // Check if Landing Page design files are approved and move to Dev if needed
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
      try {
        project.tasks = await this.tasksRepository.find({
          where: { projectId: id },
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

      // Check if Landing Page design files are approved and move to Dev if needed
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

      // Find Landing Page deliverable
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
        console.log(`[ProjectsService] Moved project ${project.id} (${project.clientName}) to Development stage - all Landing Page design files are approved`);
      }
    } catch (error) {
      console.error('[ProjectsService] Error checking Landing Page design approval:', error);
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

  async getStats(userId: string, userRole: string) {
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
        waitingStages: [ProjectStage.COPY_REVISION, ProjectStage.DESIGN_REVISION],
      })
      .getCount();

    return {
      total,
      byStage,
      overdue,
    };
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
}

