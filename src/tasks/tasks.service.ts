import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task, TaskStatus, TaskType } from './entities/task.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Deliverable, DeliverableType, DeliverableStatus } from '../deliverables/entities/deliverable.entity';
import { Project, ProjectStage } from '../projects/entities/project.entity';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectRepository(Deliverable)
    private deliverablesRepository: Repository<Deliverable>,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  async findAll(projectId?: string, assignedToId?: string, limit?: number, loadAll?: boolean) {
    try {
      console.log(`[TasksService] Finding tasks - projectId: ${projectId}, assignedToId: ${assignedToId}, limit: ${limit}, loadAll: ${loadAll}`);
      
      // Removed enum fix query - it was running on every request and slowing things down
      // Run this once via migration script instead of on every request
      
      // Now try to load tasks normally
      // Use inner joins only when we have filters to improve performance
      const queryBuilder = this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.project', 'project')
        .leftJoinAndSelect('task.assignedTo', 'assignedTo');
      
      // Add index hint for better performance on large datasets
      // PostgreSQL will use the index on createdAt for ordering

      // Exclude archived tasks by default (soft-hide pattern)
      const conditions: string[] = ['task.isArchived = :isArchived'];
      const params: any = { isArchived: false };

      if (projectId) {
        conditions.push('task.projectId = :projectId');
        params.projectId = projectId;
      }

      if (assignedToId) {
        conditions.push('task.assignedToId = :assignedToId');
        params.assignedToId = assignedToId;
      }

      queryBuilder.where(conditions.join(' AND '), params);

      // Apply limit for performance - default to 200 if no filters and not loading all
      if (!loadAll) {
        const defaultLimit = limit || 200; // Increased default limit to 200
        if (!projectId && !assignedToId) {
          queryBuilder.limit(defaultLimit);
          console.log(`[TasksService] No filters provided - limiting to ${defaultLimit} most recent tasks for performance`);
        } else if (limit) {
          queryBuilder.limit(limit);
        }
      } else {
        console.log('[TasksService] Loading all tasks (loadAll=true)');
      }

      const tasks = await queryBuilder.orderBy('task.createdAt', 'DESC').getMany();
      
      // Fix enum issues in memory only (don't save to DB on every request - too slow)
      // Only fix in memory for display, actual DB fix should be done via migration
      tasks.forEach(task => {
        if ((task.type as any) === 'Intake') {
          task.type = TaskType.INTAKE;
        }
      });
      
      console.log(`[TasksService] Found ${tasks.length} tasks`);
      return tasks;
    } catch (error: any) {
      console.error('[TasksService] Error in findAll:', error);
      console.error('[TasksService] Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      
      // If the error is related to enum, try to fix it and retry
      if (error.message && error.message.includes('enum')) {
        console.log('[TasksService] Enum error detected, attempting to fix...');
        try {
          // Use raw query to update enum values
          await this.tasksRepository.manager.query(
            `UPDATE tasks SET type = 'Onboarding' WHERE type = 'Intake'`
          );
          
          // Retry the query
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
        } catch (retryError) {
          console.error('[TasksService] Retry after enum fix also failed:', retryError);
        }
      }
      
      // Last resort: return empty array instead of crashing
      console.error('[TasksService] Returning empty array due to error');
      return [];
    }
  }

  async findOne(id: string) {
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['project', 'project.pm', 'assignedTo'],
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async updateStatus(id: string, status: TaskStatus, isCompleted?: boolean, fileUrl?: string, deliverableType?: string, deliverableId?: string) {
    const task = await this.findOne(id);
    const wasCompleted = task.isCompleted;
    const wasInReview = task.status === TaskStatus.IN_REVIEW; // Check BEFORE updating status
    const isChangingToInReview = status === TaskStatus.IN_REVIEW && !wasInReview;
    
    task.status = status;
    if (isCompleted !== undefined) {
      task.isCompleted = isCompleted;
    }
    if (fileUrl !== undefined) {
      task.fileUrl = fileUrl;
    }
    // Update deliverableId if provided (important for linking tasks to specific deliverables, especially custom ones)
    if (deliverableId !== undefined) {
      task.deliverableId = deliverableId;
    }
    const savedTask = await this.tasksRepository.save(task);

    // When copy or design task is sent for review, update deliverables and notify PM
    // Only notify if status changed TO "In Review" (not if it was already in review)
    if (isChangingToInReview && (task.type === TaskType.COPY || task.type === TaskType.DESIGN)) {
      try {
        // Reuse project from task (already loaded in findOne) - no need to query again
        const projectWithPM = task.project;

        // Run notification and deliverable updates in parallel for better performance
        const promises: Promise<any>[] = [];

        // Notify PM that copy/design has been sent for review
        if (projectWithPM && projectWithPM.pmId) {
          promises.push(
            this.notificationsService.createTaskSentForReviewNotification(
              projectWithPM.pmId,
              savedTask.id,
              task.projectId,
              task.title,
              projectWithPM.clientName,
              !!fileUrl,
              task.type,
            ).catch(err => {
              console.error('Failed to create notification:', err);
            })
          );
        }

        // Update deliverables if fileUrl is provided
        if (fileUrl && deliverableType) {
          promises.push(
            (async () => {
              // Find deliverables for this project
              const deliverables = await this.deliverablesRepository.find({
                where: { projectId: task.projectId },
              });

              // Find the specific deliverable - prefer deliverableId if provided
              let targetDeliverable: any = null;
              
              if (deliverableId) {
                targetDeliverable = deliverables.find(d => d.id === deliverableId);
              } else {
                targetDeliverable = deliverables.find(d => d.type === deliverableType);
                if (!targetDeliverable && deliverableType === 'Other') {
                  targetDeliverable = deliverables.find(d => d.type === 'Other' && d.customType);
                }
              }
              
              if (targetDeliverable) {
                // Update the selected deliverable
                targetDeliverable.fileUrl = fileUrl;
                if (targetDeliverable.status === DeliverableStatus.REVISION) {
                  targetDeliverable.status = DeliverableStatus.READY_FOR_REVIEW;
                  targetDeliverable.notes = null;
                } else {
                  targetDeliverable.status = DeliverableStatus.READY_FOR_REVIEW;
                }
                await this.deliverablesRepository.save(targetDeliverable);
                
                // If this is a design task and project is in Design Revision stage, update it back to Design
                // Reuse project from task instead of querying again
                if (task.type === TaskType.DESIGN && projectWithPM && projectWithPM.stage === ProjectStage.DESIGN_REVISION) {
                  const designDeliverableTypes = [
                    DeliverableType.LOGO,
                    DeliverableType.SOCIAL_BANNERS,
                    DeliverableType.SPEAKER_KIT,
                    DeliverableType.LANDING_PAGE,
                  ];
                  const otherDesignDeliverables = deliverables.filter(d => 
                    designDeliverableTypes.includes(d.type) && 
                    d.id !== targetDeliverable.id &&
                    d.status === DeliverableStatus.REVISION
                  );
                  
                  // Only change back to Design if no other design deliverables are in revision
                  if (otherDesignDeliverables.length === 0) {
                    const projectRepo = this.tasksRepository.manager.getRepository(Project);
                    projectWithPM.stage = ProjectStage.DESIGN;
                    await projectRepo.save(projectWithPM);
                  }
                }
              } else {
                // If deliverable doesn't exist, create it
                const newDeliverable = this.deliverablesRepository.create({
                  projectId: task.projectId,
                  type: deliverableType as DeliverableType,
                  fileUrl: fileUrl,
                  status: DeliverableStatus.READY_FOR_REVIEW,
                });
                await this.deliverablesRepository.save(newDeliverable);
              }
            })().catch(err => {
              console.error('Failed to update deliverables:', err);
            })
          );
        }

        // Wait for all operations to complete in parallel
        await Promise.all(promises);
      } catch (error) {
        console.error('Failed to update deliverables or create notification:', error);
      }
    }

    // Create notification when task is completed
    if (!wasCompleted && isCompleted && task.project && task.project.pmId) {
      try {
        await this.notificationsService.createTaskCompletedNotification(
          task.project.pmId, // userId (PM receives the notification)
          task.id,
          task.projectId,
          task.title,
          task.project.clientName,
          task.assignedToId, // assignedToId (the user who completed the task)
        );
      } catch (error) {
        console.error('Failed to create notification:', error);
      }
    }

    return savedTask;
  }

  async assignTask(id: string, assignedToId: string) {
    const task = await this.findOne(id);
    task.assignedToId = assignedToId;
    const savedTask = await this.tasksRepository.save(task);

    // Create notification for assigned user
    if (assignedToId && task.project) {
      try {
        await this.notificationsService.createTaskAssignedNotification(
          assignedToId, // userId (the user receiving the notification)
          task.id,
          task.projectId,
          task.title,
          task.project.clientName,
          assignedToId, // assignedToId (the user assigned to the task)
        );
      } catch (error) {
        console.error('Failed to create notification:', error);
      }
    }

    return savedTask;
  }

  async create(createTaskDto: any) {
    const task = this.tasksRepository.create(createTaskDto);
    return this.tasksRepository.save(task);
  }

  async submitOnboardingData(id: string, submissionData: string, submissionType: 'url' | 'text') {
    const task = await this.findOne(id);
    
    // Only allow submission for onboarding tasks
    if (task.type !== TaskType.INTAKE) {
      throw new Error('Submissions are only allowed for onboarding tasks');
    }

    task.submissionData = submissionData;
    task.submissionType = submissionType;
    task.isCompleted = true;
    task.status = TaskStatus.COMPLETED;
    
    return this.tasksRepository.save(task);
  }

  async update(id: string, updateTaskDto: { title?: string; description?: string; dueDate?: Date; deliverableId?: string }) {
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

  async remove(id: string) {
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
    return { message: 'Task deleted successfully' };
  }
}

