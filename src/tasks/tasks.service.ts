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

  async findAll(projectId?: string, assignedToId?: string) {
    try {
      console.log(`[TasksService] Finding tasks - projectId: ${projectId}, assignedToId: ${assignedToId}`);
      
      // First, try to fix any tasks with old enum values using raw query
      try {
        await this.tasksRepository.query(
          `UPDATE tasks SET type = $1 WHERE type = $2`,
          [TaskType.INTAKE, 'Intake']
        );
      } catch (updateError) {
        console.log('[TasksService] Could not update enum values (may already be fixed):', updateError.message);
      }
      
      // Now try to load tasks normally
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
      
      // Fix any remaining enum issues
      for (const task of tasks) {
        if ((task.type as any) === 'Intake') {
          task.type = TaskType.INTAKE;
          await this.tasksRepository.save(task).catch(err => {
            console.error(`[TasksService] Could not save task ${task.id}:`, err);
          });
        }
      }
      
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

  async updateStatus(id: string, status: TaskStatus, isCompleted?: boolean, fileUrl?: string, deliverableType?: string) {
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
    const savedTask = await this.tasksRepository.save(task);

    // When copy or design task is sent for review, update deliverables and notify PM
    // Only notify if status changed TO "In Review" (not if it was already in review)
    if (isChangingToInReview && (task.type === TaskType.COPY || task.type === TaskType.DESIGN)) {
      try {
        // Ensure we have the project with PM info
        const projectRepo = this.tasksRepository.manager.getRepository(Project);
        const projectWithPM = await projectRepo.findOne({
          where: { id: task.projectId },
        });

        // Notify PM that copy has been sent for review
        if (projectWithPM && projectWithPM.pmId) {
          console.log('Creating notification for PM:', projectWithPM.pmId, 'Task:', task.title, 'Project:', projectWithPM.clientName);
          await this.notificationsService.createTaskSentForReviewNotification(
            projectWithPM.pmId,
            savedTask.id,
            task.projectId,
            task.title,
            projectWithPM.clientName,
            !!fileUrl,
          );
          console.log('Notification created successfully');
        } else {
          console.log('No PM found for project:', task.projectId, 'Project:', projectWithPM);
        }

        // Update deliverables if fileUrl is provided
        if (fileUrl && deliverableType) {
          // Find deliverables for this project
          const deliverables = await this.deliverablesRepository.find({
            where: { projectId: task.projectId },
          });

          // Find the specific deliverable type that was selected
          const targetDeliverable = deliverables.find(d => d.type === deliverableType);
          
          if (targetDeliverable) {
            // Update the selected deliverable
            // If it was in Revision status, change back to Ready for Review
            targetDeliverable.fileUrl = fileUrl;
            if (targetDeliverable.status === DeliverableStatus.REVISION) {
              targetDeliverable.status = DeliverableStatus.READY_FOR_REVIEW;
              targetDeliverable.notes = null; // Clear revision notes
            } else {
              targetDeliverable.status = DeliverableStatus.READY_FOR_REVIEW;
            }
            await this.deliverablesRepository.save(targetDeliverable);
            console.log('Updated deliverable:', deliverableType, 'with file URL');
            
            // If this is a design task and project is in Design Revision stage, update it back to Design
            if (task.type === TaskType.DESIGN && task.project) {
              const projectRepo = this.tasksRepository.manager.getRepository(Project);
              const project = await projectRepo.findOne({ where: { id: task.projectId } });
              if (project && project.stage === ProjectStage.DESIGN_REVISION) {
                // Check if there are any other design deliverables still in revision
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
                  project.stage = ProjectStage.DESIGN;
                  await projectRepo.save(project);
                  console.log('Updated project stage from Design Revision to Design');
                }
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
            console.log('Created new deliverable:', deliverableType);
          }
        }
      } catch (error) {
        console.error('Failed to update deliverables or create notification:', error);
      }
    }

    // Create notification when task is completed
    if (!wasCompleted && isCompleted && task.project && task.project.pmId) {
      try {
        await this.notificationsService.createTaskCompletedNotification(
          task.project.pmId,
          task.id,
          task.projectId,
          task.title,
          task.project.clientName,
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
          assignedToId,
          task.id,
          task.projectId,
          task.title,
          task.project.clientName,
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

