import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonthlyReminder } from './entities/monthly-reminder.entity';
import { CreateMonthlyReminderDto } from './dto/create-monthly-reminder.dto';
import { UpdateMonthlyReminderDto } from './dto/update-monthly-reminder.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';

@Injectable()
export class MonthlyRemindersService {
  constructor(
    @InjectRepository(MonthlyReminder)
    private readonly remindersRepository: Repository<MonthlyReminder>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectsRepository: Repository<Project>,
  ) {}

  private getCurrentMonthKey(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  }

  private async assertPmAccess(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new ForbiddenException('User not found');

    const isPm = user.role === UserRole.PROJECT_MANAGER;
    const isFounder = user.role === UserRole.FOUNDER_CEO;
    if (!isPm && !isFounder && !user.isHeadPM) {
      throw new ForbiddenException('Only Project Managers / Head PM / Founder can manage monthly reminders.');
    }
    return user;
  }

  async findAll(userId: string) {
    await this.assertPmAccess(userId);
    return this.remindersRepository.find({
      relations: ['project'],
      order: { reminderDay: 'ASC', clientName: 'ASC', createdAt: 'DESC' },
    });
  }

  async findByProject(projectId: string, userId: string) {
    await this.assertPmAccess(userId);
    return this.remindersRepository.find({
      where: { projectId },
      relations: ['project'],
      order: { reminderDay: 'ASC', createdAt: 'DESC' },
    });
  }

  async create(dto: CreateMonthlyReminderDto, userId: string) {
    await this.assertPmAccess(userId);

    let project: Project | null = null;
    if (dto.projectId) {
      project = await this.projectsRepository.findOne({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }

    const clientName = project?.clientName || (dto.clientName || '').trim();
    if (!clientName) {
      throw new BadRequestException('Client name is required when no project is linked.');
    }
    if (!dto.note?.trim()) {
      throw new BadRequestException('Note is required.');
    }

    const reminder = this.remindersRepository.create({
      projectId: project?.id || null,
      clientName,
      reminderDay: dto.reminderDay,
      note: dto.note.trim(),
      reminderLink: dto.reminderLink?.trim() || null,
      currentMonthKey: dto.currentMonthKey || this.getCurrentMonthKey(),
      currentMonthStatus: dto.currentMonthStatus || 'pending',
      nextMonthStatus: dto.nextMonthStatus ?? null,
      createdById: userId,
      updatedById: userId,
    });

    return this.remindersRepository.save(reminder);
  }

  async update(id: string, dto: UpdateMonthlyReminderDto, userId: string) {
    await this.assertPmAccess(userId);

    const reminder = await this.remindersRepository.findOne({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');

    let project: Project | null = null;
    const projectIdFromDto = Object.prototype.hasOwnProperty.call(dto, 'projectId');
    if (projectIdFromDto) {
      if (dto.projectId) {
        project = await this.projectsRepository.findOne({ where: { id: dto.projectId } });
        if (!project) throw new NotFoundException('Project not found');
        reminder.projectId = project.id;
      } else {
        reminder.projectId = null;
      }
    } else if (reminder.projectId) {
      project = await this.projectsRepository.findOne({ where: { id: reminder.projectId } });
    }

    if (typeof dto.reminderDay === 'number') reminder.reminderDay = dto.reminderDay;
    if (typeof dto.note === 'string') reminder.note = dto.note.trim();
    if (typeof dto.reminderLink === 'string') reminder.reminderLink = dto.reminderLink.trim() || null;
    if (Object.prototype.hasOwnProperty.call(dto, 'currentMonthKey')) reminder.currentMonthKey = dto.currentMonthKey || null;
    if (typeof dto.currentMonthStatus === 'string') reminder.currentMonthStatus = dto.currentMonthStatus;
    if (Object.prototype.hasOwnProperty.call(dto, 'nextMonthStatus')) reminder.nextMonthStatus = dto.nextMonthStatus ?? null;

    const clientNameCandidate =
      project?.clientName ||
      (typeof dto.clientName === 'string' ? dto.clientName.trim() : reminder.clientName);
    if (!clientNameCandidate) {
      throw new BadRequestException('Client name is required when no project is linked.');
    }
    reminder.clientName = clientNameCandidate;
    if (!reminder.currentMonthKey) reminder.currentMonthKey = this.getCurrentMonthKey();
    if (!reminder.currentMonthStatus) reminder.currentMonthStatus = 'pending';
    reminder.updatedById = userId;

    return this.remindersRepository.save(reminder);
  }

  async remove(id: string, userId: string) {
    await this.assertPmAccess(userId);
    const reminder = await this.remindersRepository.findOne({ where: { id } });
    if (!reminder) throw new NotFoundException('Reminder not found');
    await this.remindersRepository.delete({ id });
    return { success: true };
  }
}

