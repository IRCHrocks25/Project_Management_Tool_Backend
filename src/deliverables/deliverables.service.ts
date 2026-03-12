import { Injectable, NotFoundException, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deliverable, DeliverableStatus, DeliverableType } from './entities/deliverable.entity';
import { DeliverableTeamMember } from './entities/deliverable-team-member.entity';
import { DeliverableHistory, DeliverableAction } from './entities/deliverable-history.entity';
import { Task, TaskType, TaskStatus } from '../tasks/entities/task.entity';
import { Project, ProjectStage } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class DeliverablesService {
  constructor(
    @InjectRepository(Deliverable)
    private deliverablesRepository: Repository<Deliverable>,
    @InjectRepository(DeliverableTeamMember)
    private deliverableTeamMembersRepository: Repository<DeliverableTeamMember>,
    @InjectRepository(DeliverableHistory)
    private historyRepository: Repository<DeliverableHistory>,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  async create(projectId: string, type: DeliverableType, customType?: string) {
    // Verify project exists
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Create deliverable
    const deliverable = this.deliverablesRepository.create({
      projectId,
      type,
      customType: customType || null,
      status: DeliverableStatus.NOT_STARTED,
    });

    return await this.deliverablesRepository.save(deliverable);
  }

  async findAll(projectId?: string) {
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

  async findOne(id: string) {
    const deliverable = await this.deliverablesRepository.findOne({
      where: { id },
      relations: ['project', 'teamMembers', 'teamMembers.user'],
    });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    return deliverable;
  }

  async remove(id: string) {
    const deliverable = await this.deliverablesRepository.findOne({ where: { id } });

    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    // Only allow deletion for custom deliverables (type OTHER or has customType)
    const isCustom = deliverable.type === DeliverableType.OTHER || !!deliverable.customType;
    if (!isCustom) {
      throw new BadRequestException('Only custom deliverables can be deleted');
    }

    // Prevent deletion if there are tasks explicitly linked to this deliverable
    const linkedTasksCount = await this.tasksRepository.count({
      where: { deliverableId: id },
    });
    if (linkedTasksCount > 0) {
      throw new BadRequestException('Cannot delete deliverable while tasks are linked to it');
    }

    // Clean up related team members and history first
    await this.deliverableTeamMembersRepository.delete({ deliverableId: id });
    await this.historyRepository.delete({ deliverableId: id });

    await this.deliverablesRepository.delete(id);
    return { success: true };
  }

  async updateStatus(id: string, status: DeliverableStatus, notes?: string, userId?: string, fileUrl?: string) {
    const deliverable = await this.findOne(id);
    const previousStatus = deliverable.status;
    
    // If fileUrl is provided, this is a file-level approval/revision, not overall deliverable
    if (fileUrl) {
      // For file-level actions, we don't change the overall deliverable status
      // We just log the history for that specific file
      let action = DeliverableAction.STATUS_CHANGED;
      if (status === DeliverableStatus.APPROVED) {
        action = DeliverableAction.APPROVED;
      } else if (status === DeliverableStatus.REVISION) {
        action = DeliverableAction.REVISION_REQUESTED;
      }

      // Create history entry for this specific file
      const history = this.historyRepository.create({
        deliverableId: id,
        fileUrl: fileUrl,
        userId: userId || null,
        action,
        previousStatus: 'Ready for Review', // File was in review
        newStatus: status === DeliverableStatus.APPROVED ? 'Approved' : 'Revision',
        notes: notes || null,
      });
      await this.historyRepository.save(history);

      // If revision requested for a file, handle it
      if (status === DeliverableStatus.REVISION) {
        await this.handleFileRevisionRequest(deliverable, fileUrl);
      }

      // If Home Page design is approved, automatically move project to Development
      if (status === DeliverableStatus.APPROVED && deliverable.type === DeliverableType.LANDING_PAGE) {
        const project = await this.projectsRepository.findOne({
          where: { id: deliverable.projectId },
        });

        if (project) {
          // Check if this is a design file (Figma link) or associated with a design task
          const isDesignFile = fileUrl.includes('figma.com') || fileUrl.includes('figma');
          
          // Also check if this file is associated with a design task
          const designTasks = await this.tasksRepository.find({
            where: {
              projectId: deliverable.projectId,
              fileUrl: fileUrl,
              type: TaskType.DESIGN,
            },
          });

          // If this is a design file (Figma link) or associated with a design task, move to Development
          if ((isDesignFile || designTasks.length > 0) && project.stage !== ProjectStage.DEV) {
            project.stage = ProjectStage.DEV;
            await this.projectsRepository.save(project);
            console.log(`[DeliverablesService] Moved project ${project.id} (${project.clientName}) to Development stage after Home Page design approval`);
          }
        }
      }

      return deliverable; // Return deliverable without changing its overall status
    }
    
    // Overall deliverable status change
    deliverable.status = status;
    
    if (notes !== undefined) {
      deliverable.notes = notes;
    }

    const savedDeliverable = await this.deliverablesRepository.save(deliverable);

    // Log the status change in history
    let action = DeliverableAction.STATUS_CHANGED;
    if (status === DeliverableStatus.APPROVED && previousStatus !== DeliverableStatus.APPROVED) {
      action = DeliverableAction.APPROVED;
    } else if (status === DeliverableStatus.REVISION && previousStatus !== DeliverableStatus.REVISION) {
      action = DeliverableAction.REVISION_REQUESTED;
    }

    // Create history entry
    const history = this.historyRepository.create({
      deliverableId: id,
      fileUrl: null, // Overall deliverable status change
      userId: userId || null,
      action,
      previousStatus,
      newStatus: status,
      notes: notes || null,
    });
    await this.historyRepository.save(history);

    // If deliverable is marked as Revision and it's copy-related, update tasks and project stage
    if (status === DeliverableStatus.REVISION && previousStatus !== DeliverableStatus.REVISION) {
      await this.handleRevisionRequest(deliverable);
    }

    return savedDeliverable;
  }

  private async handleFileRevisionRequest(deliverable: Deliverable, fileUrl: string) {
    // Find tasks associated with this file URL
    const relatedTasks = await this.tasksRepository.find({
      where: {
        projectId: deliverable.projectId,
        fileUrl: fileUrl,
      },
    });

    // Get the project to update its stage
    const project = await this.projectsRepository.findOne({
      where: { id: deliverable.projectId },
    });

    if (!project) return;

    // Determine if this is a design deliverable
    const designDeliverableTypes = [
      DeliverableType.LOGO,
      DeliverableType.SOCIAL_BANNERS,
      DeliverableType.SPEAKER_KIT,
      DeliverableType.LANDING_PAGE,
    ];

    // If it's a design deliverable, update project stage to Design Revision
    if (designDeliverableTypes.includes(deliverable.type) && project.stage !== ProjectStage.DESIGN_REVISION) {
      project.stage = ProjectStage.DESIGN_REVISION;
      project.designRevisionCount += 1;
      
      // Track Home Page revisions separately
      if (deliverable.type === DeliverableType.LANDING_PAGE) {
        project.landingPageRevisionCount += 1;
      }
      
      await this.projectsRepository.save(project);
    }

    // Update related tasks to "In Progress" for revision
    for (const task of relatedTasks) {
      task.status = TaskStatus.IN_PROGRESS;
      task.isCompleted = false;
      await this.tasksRepository.save(task);

      // Notify ONLY the assigned user for this specific task
      if (task.assignedToId) {
        try {
          const revData = {
            type: NotificationType.REVISION_REQUESTED,
            title: 'Revision requested',
            message: `"${deliverable.customType || deliverable.type}" file for ${project?.clientName || 'project'} needs revision`,
            projectId: deliverable.projectId,
            taskId: task.id,
          };
          await this.notificationsService.create({ ...revData, userId: task.assignedToId });
          this.notificationsService.notifyHeadPMsAlso(revData, task.assignedToId).catch(() => {});
        } catch (error) {
          console.error('Failed to create revision notification:', error);
        }
      }
    }
  }

  async getHistory(deliverableId: string, fileUrl?: string) {
    const where: any = { deliverableId };
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

  private async handleRevisionRequest(deliverable: Deliverable) {
    const copyDeliverableTypes = [
      DeliverableType.BRAND_BOOK,
      DeliverableType.COPY_OF_LANDING_PAGE,
      DeliverableType.LANDING_PAGE,
      DeliverableType.SPEAKER_KIT,
      DeliverableType.OTHER,
    ];

    // Only handle copy-related deliverables
    if (!copyDeliverableTypes.includes(deliverable.type)) {
      return;
    }

    try {
      // Find copy tasks SPECIFICALLY related to this deliverable
      // First, try to find tasks by deliverableId (most accurate)
      let relatedCopyTasks = await this.tasksRepository.find({
        where: {
          projectId: deliverable.projectId,
          type: TaskType.COPY,
          deliverableId: deliverable.id, // Only tasks for THIS deliverable
        },
      });

      // If no tasks found by deliverableId, try matching by deliverable type in task title
      // This handles cases where tasks were created before deliverableId was set
      if (relatedCopyTasks.length === 0) {
        const deliverableName = deliverable.customType || deliverable.type;
        const allCopyTasks = await this.tasksRepository.find({
          where: {
            projectId: deliverable.projectId,
            type: TaskType.COPY,
          },
        });
        // Match tasks where title contains the deliverable name
        relatedCopyTasks = allCopyTasks.filter(task => 
          task.title.includes(deliverableName) || 
          task.title.includes(deliverable.type)
        );
      }

      // Update related copy tasks to "In Progress" status (so copywriters can work on revisions)
      for (const task of relatedCopyTasks) {
        task.status = TaskStatus.IN_PROGRESS;
        task.isCompleted = false;
        await this.tasksRepository.save(task);
      }

      // Update project stage to Copy Revision if not already
      const project = await this.projectsRepository.findOne({
        where: { id: deliverable.projectId },
      });

      if (project && project.stage !== ProjectStage.COPY_REVISION) {
        project.stage = ProjectStage.COPY_REVISION;
        project.copyRevisionCount += 1;
        await this.projectsRepository.save(project);
      }

      // Notify ONLY copywriters assigned to tasks related to THIS deliverable
      for (const task of relatedCopyTasks) {
        if (task.assignedToId) {
          try {
            const revData = {
              type: NotificationType.REVISION_REQUESTED,
              title: 'Revision requested',
              message: `"${deliverable.customType || deliverable.type}" for ${project?.clientName || 'project'} needs revision`,
              projectId: deliverable.projectId,
              taskId: task.id,
            };
            await this.notificationsService.create({ ...revData, userId: task.assignedToId });
            this.notificationsService.notifyHeadPMsAlso(revData, task.assignedToId).catch(() => {});
          } catch (error) {
            console.error('Failed to create revision notification:', error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle revision request:', error);
    }
  }

  async addTeamMember(deliverableId: string, userId: string) {
    const deliverable = await this.deliverablesRepository.findOne({ where: { id: deliverableId } });
    if (!deliverable) {
      throw new NotFoundException('Deliverable not found');
    }

    // Check if member already exists
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

  async removeTeamMember(deliverableId: string, userId: string) {
    const result = await this.deliverableTeamMembersRepository.delete({
      deliverableId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Team member not found');
    }

    return { success: true };
  }

  async getTeamMembers(deliverableId: string) {
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

  async update(id: string, updateDto: { customType?: string }) {
    console.log(`[DeliverablesService] update called for id: ${id}, data:`, updateDto);
    const deliverable = await this.findOne(id);

    // Only allow updating custom deliverables (type OTHER or has customType)
    const isCustom = deliverable.type === DeliverableType.OTHER || !!deliverable.customType;
    if (!isCustom) {
      throw new BadRequestException('Only custom deliverables can be updated');
    }

    if (updateDto.customType !== undefined) {
      deliverable.customType = updateDto.customType || null;
    }

    const updated = await this.deliverablesRepository.save(deliverable);
    console.log(`[DeliverablesService] update completed for id: ${id}, new customType: ${updated.customType}`);
    return updated;
  }
}

