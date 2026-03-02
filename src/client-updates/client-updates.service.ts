import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientUpdate, UpdateStatus } from './entities/client-update.entity';
import { ClientUpdateForm, FormBlock } from './entities/client-update-form.entity';
import { ClientUpdateFormSubmission } from './entities/client-update-form-submission.entity';
import { ClientUpdateComment } from './entities/client-update-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { CreateClientUpdateDto } from './dto/create-client-update.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CloudinaryService } from './cloudinary.service';
import { randomBytes } from 'crypto';

@Injectable()
export class ClientUpdatesService {
  constructor(
    @InjectRepository(ClientUpdate)
    private clientUpdatesRepository: Repository<ClientUpdate>,
    @InjectRepository(ClientUpdateForm)
    private formsRepository: Repository<ClientUpdateForm>,
    @InjectRepository(ClientUpdateFormSubmission)
    private submissionsRepository: Repository<ClientUpdateFormSubmission>,
    @InjectRepository(ClientUpdateComment)
    private commentsRepository: Repository<ClientUpdateComment>,
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(createDto: CreateClientUpdateDto, pmId: string): Promise<ClientUpdate> {
    const project = await this.projectsRepository.findOne({
      where: { id: createDto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const update = this.clientUpdatesRepository.create({
      projectId: createDto.projectId,
      pmId,
      emailSentAt: new Date(),
      status: UpdateStatus.PUBLISHED, // When logging an email, it's already sent/published
      notes: createDto.notes || null,
      links: createDto.links && createDto.links.length > 0 ? createDto.links : null,
    });

    return await this.clientUpdatesRepository.save(update);
  }

  async findAllByProject(projectId: string): Promise<ClientUpdate[]> {
    return await this.clientUpdatesRepository.find({
      where: { projectId },
      relations: ['pm', 'forms'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ClientUpdate> {
    const update = await this.clientUpdatesRepository.findOne({
      where: { id },
      relations: ['pm', 'project', 'forms', 'forms.submissions'],
    });

    if (!update) {
      throw new NotFoundException('Client update not found');
    }

    return update;
  }

  async createForm(createDto: CreateFormDto): Promise<ClientUpdateForm> {
    const update = await this.clientUpdatesRepository.findOne({
      where: { id: createDto.updateId },
    });

    if (!update) {
      throw new NotFoundException('Client update not found');
    }

    // Generate unguessable public token
    const publicToken = randomBytes(32).toString('hex');

    const form = this.formsRepository.create({
      updateId: createDto.updateId,
      publicToken,
      isPublished: false,
      blocks: createDto.blocks as FormBlock[],
    });

    return await this.formsRepository.save(form);
  }

  async updateForm(formId: string, blocks: FormBlock[]): Promise<ClientUpdateForm> {
    const form = await this.formsRepository.findOne({
      where: { id: formId },
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    form.blocks = blocks;
    return await this.formsRepository.save(form);
  }

  async publishForm(formId: string): Promise<ClientUpdateForm> {
    const form = await this.formsRepository.findOne({
      where: { id: formId },
      relations: ['update'],
    });

    if (!form) {
      throw new NotFoundException('Form not found');
    }

    form.isPublished = true;
    await this.formsRepository.save(form);

    // Update the parent update status to published
    const update = form.update;
    if (update.status === UpdateStatus.DRAFT) {
      update.status = UpdateStatus.PUBLISHED;
      await this.clientUpdatesRepository.save(update);
    }

    return form;
  }

  async getFormByToken(publicToken: string): Promise<ClientUpdateForm> {
    const form = await this.formsRepository.findOne({
      where: { publicToken, isPublished: true },
      relations: ['update', 'update.project'],
    });

    if (!form) {
      throw new NotFoundException('Form not found or not published');
    }

    return form;
  }

  async submitForm(submitDto: SubmitFormDto): Promise<ClientUpdateFormSubmission> {
    const form = await this.formsRepository.findOne({
      where: { id: submitDto.formId, isPublished: true },
      relations: ['update'],
    });

    if (!form) {
      throw new NotFoundException('Form not found or not published');
    }

    const submission = this.submissionsRepository.create({
      formId: submitDto.formId,
      responses: submitDto.responses,
      clientName: submitDto.clientName,
      clientEmail: submitDto.clientEmail,
      submittedAt: new Date(),
    });

    await this.submissionsRepository.save(submission);

    // Update the parent update status to responded
    const update = form.update;
    if (update.status !== UpdateStatus.RESPONDED) {
      update.status = UpdateStatus.RESPONDED;
      await this.clientUpdatesRepository.save(update);
    }

    return submission;
  }

  async getFormSubmissions(formId: string): Promise<ClientUpdateFormSubmission[]> {
    return await this.submissionsRepository.find({
      where: { formId },
      order: { submittedAt: 'DESC' },
    });
  }

  async uploadImage(file: Express.Multer.File, projectId?: string): Promise<string> {
    let folder = 'PM_tool/uploads';
    
    // If projectId is provided, fetch the project to get client name
    if (projectId) {
      try {
        const project = await this.projectsRepository.findOne({
          where: { id: projectId },
          select: ['clientName'],
        });
        
        if (project?.clientName) {
          // Sanitize client name for folder path (remove special characters)
          const sanitizedClientName = project.clientName
            .replace(/[^a-zA-Z0-9-_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
          folder = `PM_tool/${sanitizedClientName}`;
        }
      } catch (error) {
        console.error('Failed to fetch project for folder organization:', error);
        // Fall back to default folder
      }
    }
    
    return await this.cloudinaryService.uploadImage(file, folder);
  }

  async createComment(updateId: string, createDto: CreateCommentDto, userId: string): Promise<ClientUpdateComment> {
    const update = await this.clientUpdatesRepository.findOne({
      where: { id: updateId },
    });

    if (!update) {
      throw new NotFoundException('Client update not found');
    }

    const comment = this.commentsRepository.create({
      updateId,
      userId,
      text: createDto.text,
      mentionedUserIds: createDto.mentionedUserIds && createDto.mentionedUserIds.length > 0 
        ? createDto.mentionedUserIds 
        : null,
    });

    const savedComment = await this.commentsRepository.save(comment);

    // TODO: Send notifications to mentioned users
    if (createDto.mentionedUserIds && createDto.mentionedUserIds.length > 0) {
      // Notification logic can be added here
      console.log('Mentioned users:', createDto.mentionedUserIds);
    }

    return await this.commentsRepository.findOne({
      where: { id: savedComment.id },
      relations: ['user'],
    });
  }

  async getComments(updateId: string): Promise<ClientUpdateComment[]> {
    const update = await this.clientUpdatesRepository.findOne({
      where: { id: updateId },
    });

    if (!update) {
      throw new NotFoundException('Client update not found');
    }

    return await this.commentsRepository.find({
      where: { updateId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }
}

