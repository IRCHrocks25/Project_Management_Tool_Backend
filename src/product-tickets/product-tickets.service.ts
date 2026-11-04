import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { extractMentionIds, stripMentionMarkup } from '../shared/mentions';
import { ProductTicket } from './entities/product-ticket.entity';
import {
  CreateProductTicketDto,
  ListProductTicketsQueryDto,
  UpdateProductTicketDto,
} from './dto/product-ticket.dto';
import { formatTicketKey } from './ticket-key';

export type SafeUser = Pick<User, 'id' | 'name' | 'avatarUrl' | 'role'>;

const SAFE_USER_FIELDS: (keyof User)[] = ['id', 'name', 'avatarUrl', 'role'];

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

@Injectable()
export class ProductTicketsService {
  private readonly logger = new Logger(ProductTicketsService.name);

  constructor(
    @InjectRepository(ProductTicket)
    private readonly ticketsRepo: Repository<ProductTicket>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(productId: string, query: ListProductTicketsQueryDto) {
    await this.getProduct(productId);
    const qb = this.ticketsRepo
      .createQueryBuilder('t')
      .where('t.productId = :productId', { productId })
      .orderBy('t.number', 'DESC');
    if (query.assigneeId) qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    const q = query.q?.trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('t.title ILIKE :like', { like })
            .orWhere('t.key ILIKE :like', { like })
            .orWhere('t.description ILIKE :like', { like });
        }),
      );
    }
    const tickets = await qb.getMany();
    return this.withUsers(tickets);
  }

  async findOne(productId: string, ticketId: string) {
    await this.getProduct(productId);
    const ticket = await this.getTicket(productId, ticketId);
    const [result] = await this.withUsers([ticket]);
    return result;
  }

  async create(productId: string, dto: CreateProductTicketDto, actorId: string) {
    const product = await this.getProduct(productId);
    const assigneeId = dto.assigneeId || null;
    if (assigneeId) await this.assertUserExists(assigneeId, 'That assignee does not exist.');

    const saved = await this.dataSource.transaction(async (manager) => {
      const res = await manager.query(
        `UPDATE products SET "ticketSeq" = "ticketSeq" + 1 WHERE id = $1 RETURNING "ticketSeq", code`,
        [productId],
      );
      // TypeORM returns [rows, affected] for UPDATE … RETURNING on Postgres.
      const rows: { ticketSeq: number; code: string }[] = Array.isArray(res?.[0]) ? res[0] : res;
      const row = rows?.[0];
      if (!row) throw new NotFoundException('Product not found.');
      const number = Number(row.ticketSeq);
      const ticket = manager.create(ProductTicket, {
        productId,
        number,
        key: formatTicketKey(row.code, number),
        title: dto.title.trim(),
        type: dto.type,
        priority: dto.priority,
        assigneeId,
        reporterId: actorId,
        description: dto.description ?? null,
      });
      return manager.save(ticket);
    });

    const actorName = await this.getActorName(actorId);
    const assignedNotified = new Set<string>();
    if (assigneeId && assigneeId !== actorId) {
      await this.notifyAssigned(product, saved, assigneeId, actorName);
      assignedNotified.add(assigneeId);
    }
    await this.notifyMentions(
      product,
      saved,
      extractMentionIds(saved.description).filter((id) => !assignedNotified.has(id)),
      actorId,
      actorName,
    );

    return this.findOne(productId, saved.id);
  }

  async update(
    productId: string,
    ticketId: string,
    dto: UpdateProductTicketDto,
    actorId: string,
  ) {
    const product = await this.getProduct(productId);
    const ticket = await this.getTicket(productId, ticketId);

    const previousAssigneeId = ticket.assigneeId;
    const previousMentions = extractMentionIds(ticket.description);

    if (dto.title !== undefined) ticket.title = dto.title.trim();
    if (dto.type !== undefined) ticket.type = dto.type;
    if (dto.priority !== undefined) ticket.priority = dto.priority;
    if (dto.status !== undefined) ticket.status = dto.status;
    if (dto.description !== undefined) ticket.description = dto.description;
    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) await this.assertUserExists(dto.assigneeId, 'That assignee does not exist.');
      ticket.assigneeId = dto.assigneeId || null;
    }

    const saved = await this.ticketsRepo.save(ticket);

    const actorName = await this.getActorName(actorId);
    const assignedNotified = new Set<string>();
    if (saved.assigneeId && saved.assigneeId !== previousAssigneeId && saved.assigneeId !== actorId) {
      await this.notifyAssigned(product, saved, saved.assigneeId, actorName);
      assignedNotified.add(saved.assigneeId);
    }
    if (dto.description !== undefined) {
      const added = extractMentionIds(saved.description).filter(
        (id) => !previousMentions.includes(id) && !assignedNotified.has(id),
      );
      await this.notifyMentions(product, saved, added, actorId, actorName);
    }

    return this.findOne(productId, saved.id);
  }

  async remove(productId: string, ticketId: string) {
    await this.getProduct(productId);
    const ticket = await this.getTicket(productId, ticketId);
    await this.ticketsRepo.delete(ticket.id);
    return { success: true };
  }

  // ---- helpers ----

  private async getProduct(productId: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async getTicket(productId: string, ticketId: string): Promise<ProductTicket> {
    const ticket = await this.ticketsRepo.findOne({ where: { id: ticketId, productId } });
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  private async assertUserExists(userId: string, message: string) {
    const exists = await this.usersRepo.exists({ where: { id: userId } });
    if (!exists) throw new BadRequestException(message);
  }

  private async getActorName(actorId: string): Promise<string> {
    const actor = await this.usersRepo.findOne({ where: { id: actorId }, select: ['id', 'name'] });
    return actor?.name || 'Someone';
  }

  private async withUsers(tickets: ProductTicket[]) {
    const ids = [
      ...new Set(
        tickets.flatMap((t) => [t.assigneeId, t.reporterId]).filter((id): id is string => !!id),
      ),
    ];
    const users = ids.length
      ? await this.usersRepo.find({ where: { id: In(ids) }, select: SAFE_USER_FIELDS })
      : [];
    const byId = new Map<string, SafeUser>(
      users.map((u) => [u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: u.role }]),
    );
    return tickets.map((t) => ({
      ...t,
      assignee: t.assigneeId ? byId.get(t.assigneeId) ?? null : null,
      reporter: t.reporterId ? byId.get(t.reporterId) ?? null : null,
    }));
  }

  private ticketLink(product: Product, ticket: ProductTicket) {
    return `/products/${product.slug}/tickets?ticket=${encodeURIComponent(ticket.key)}`;
  }

  private async notifyAssigned(
    product: Product,
    ticket: ProductTicket,
    userId: string,
    actorName: string,
  ) {
    try {
      await this.notificationsService.create({
        type: NotificationType.PRODUCT_ASSIGNED,
        title: `${actorName} assigned you ${ticket.key}`,
        message: `${product.name} · ${ticket.key}: ${ticket.title}`,
        userId,
        productId: product.id,
        link: this.ticketLink(product, ticket),
      });
    } catch (err) {
      this.logger.warn(`Ticket assignment notification failed: ${(err as Error).message}`);
    }
  }

  private async notifyMentions(
    product: Product,
    ticket: ProductTicket,
    userIds: string[],
    actorId: string,
    actorName: string,
  ) {
    const targets = userIds.filter((id) => id !== actorId);
    if (!targets.length) return;
    const existing = await this.usersRepo.find({ where: { id: In(targets) }, select: ['id'] });
    const body = stripMentionMarkup(ticket.description).trim();
    for (const { id } of existing) {
      try {
        await this.notificationsService.create({
          type: NotificationType.PRODUCT_MENTION,
          title: `${actorName} mentioned you in ${ticket.key}`,
          message: body ? `${ticket.title}: ${body.slice(0, 500)}` : ticket.title,
          userId: id,
          productId: product.id,
          link: this.ticketLink(product, ticket),
        });
      } catch (err) {
        this.logger.warn(`Ticket mention notification failed: ${(err as Error).message}`);
      }
    }
  }
}
