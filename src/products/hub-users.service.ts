import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

/** The only user shape the Hub returns. */
export interface SafeUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

/**
 * Shared Hub helpers: loading users without sensitive columns, and sending
 * notifications that never fail the request.
 */
@Injectable()
export class HubUsersService {
  private readonly logger = new Logger(HubUsersService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Safe users by id; unknown ids are simply missing from the map. */
  async load(ids: (string | null | undefined)[]): Promise<Map<string, SafeUser>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const map = new Map<string, SafeUser>();
    if (unique.length === 0) return map;
    const users = await this.usersRepository.find({
      select: ['id', 'name', 'avatarUrl', 'role'],
      where: { id: In(unique) },
    });
    for (const u of users) {
      map.set(u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null, role: u.role });
    }
    return map;
  }

  async findOne(id: string | null | undefined): Promise<SafeUser | null> {
    if (!id) return null;
    return (await this.load([id])).get(id) ?? null;
  }

  async notify(data: {
    type: NotificationType;
    title: string;
    message: string;
    userId: string;
    productId: string;
    link: string;
  }): Promise<void> {
    try {
      await this.notificationsService.create(data);
    } catch (error) {
      this.logger.warn(`Hub notification (${data.type}) for user ${data.userId} failed: ${error?.message || error}`);
    }
  }
}

/** Short plain-text preview for notification messages. */
export function preview(text: string, max = 280): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
