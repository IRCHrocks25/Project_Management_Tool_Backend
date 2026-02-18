import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from './entities/email.entity';
import { ProjectsService } from '../projects/projects.service';
import { CreateEmailDto } from './dto/create-email.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EmailsService {
  constructor(
    @InjectRepository(Email)
    private emailsRepository: Repository<Email>,
    private projectsService: ProjectsService,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {}

  async create(createEmailDto: CreateEmailDto, userId: string) {
    const email = this.emailsRepository.create({
      ...createEmailDto,
      sentById: userId,
      sentAt: new Date(),
    });

    const savedEmail = await this.emailsRepository.save(email);

    // Update project's lastEmailedAt
    const project = await this.projectsService.findOne(createEmailDto.projectId);
    await this.projectsService.updateLastEmailed(createEmailDto.projectId);

    // Notify PM when email is sent
    if (project && project.pmId) {
      try {
        await this.notificationsService.createEmailSentNotification(
          project.pmId,
          project.id,
          project.clientName,
        );
      } catch (error) {
        console.error('Failed to create email notification:', error);
      }
    }

    return savedEmail;
  }

  async findAll(projectId: string) {
    return this.emailsRepository.find({
      where: { projectId },
      relations: ['sentBy'],
      order: { sentAt: 'DESC' },
    });
  }
}

