import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { extractMentionIds, stripMentionMarkup } from '../shared/mentions';
import { ProductSop } from './entities/product-sop.entity';
import { ProductSopStep } from './entities/product-sop-step.entity';
import { ProductSopProgress } from './entities/product-sop-progress.entity';
import {
  CreateProductSopDto,
  CreateSopStepDto,
  SetSopStepProgressDto,
  UpdateProductSopDto,
} from './dto/product-sop.dto';
import { planStepReplace } from './sop-steps-diff';

type SafeUser = Pick<User, 'id' | 'name' | 'avatarUrl' | 'role'>;
const SAFE_USER_FIELDS: (keyof User)[] = ['id', 'name', 'avatarUrl', 'role'];

function mentionsIn(steps: { text: string }[]): string[] {
  return [...new Set(steps.flatMap((s) => extractMentionIds(s.text)))];
}

@Injectable()
export class ProductSopsService {
  private readonly logger = new Logger(ProductSopsService.name);

  constructor(
    @InjectRepository(ProductSop) private readonly sopsRepo: Repository<ProductSop>,
    @InjectRepository(ProductSopStep) private readonly stepsRepo: Repository<ProductSopStep>,
    @InjectRepository(ProductSopProgress)
    private readonly progressRepo: Repository<ProductSopProgress>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(productId: string, userId: string) {
    await this.getProduct(productId);
    const sops = await this.sopsRepo.find({
      where: { productId },
      relations: ['steps'],
      order: { title: 'ASC' },
    });
    return this.present(sops, userId);
  }

  async findOne(productId: string, sopId: string, userId: string) {
    await this.getProduct(productId);
    const sop = await this.getSop(productId, sopId, true);
    const [result] = await this.present([sop], userId);
    return result;
  }

  async create(productId: string, dto: CreateProductSopDto, actorId: string) {
    const product = await this.getProduct(productId);
    await this.assertUserExists(dto.ownerId, 'That owner does not exist.');

    const sopId = await this.dataSource.transaction(async (manager) => {
      const sop = await manager.save(
        manager.create(ProductSop, {
          productId,
          title: dto.title.trim(),
          audience: dto.audience?.trim() || null,
          ownerId: dto.ownerId,
        }),
      );
      await manager.save(
        dto.steps.map((s, i) =>
          manager.create(ProductSopStep, {
            sopId: sop.id,
            position: i + 1,
            text: s.text.trim(),
            links: s.links ?? [],
          }),
        ),
      );
      return sop.id;
    });

    const result = await this.findOne(productId, sopId, actorId);
    await this.notifyMentions(product, result, mentionsIn(dto.steps), actorId);
    return result;
  }

  async update(productId: string, sopId: string, dto: UpdateProductSopDto, actorId: string) {
    const product = await this.getProduct(productId);
    const sop = await this.getSop(productId, sopId, true);
    const previousMentions = mentionsIn(sop.steps);

    if (dto.ownerId !== undefined) await this.assertUserExists(dto.ownerId, 'That owner does not exist.');

    await this.dataSource.transaction(async (manager) => {
      const patch: Partial<ProductSop> = {};
      if (dto.title !== undefined) patch.title = dto.title.trim();
      if (dto.audience !== undefined) patch.audience = dto.audience?.trim() || null;
      if (dto.ownerId !== undefined) patch.ownerId = dto.ownerId;
      // Always bump updatedAt, even when only the steps changed.
      await manager.update(ProductSop, { id: sop.id }, { ...patch, updatedAt: new Date() });

      if (dto.steps) {
        const plan = planStepReplace(
          sop.steps.map((s) => s.id),
          dto.steps,
        );
        if (plan.delete.length) await manager.delete(ProductSopStep, { id: In(plan.delete) });
        for (const s of plan.update) {
          await manager.update(
            ProductSopStep,
            { id: s.id, sopId: sop.id },
            { position: s.position, text: s.text, links: s.links as any },
          );
        }
        if (plan.create.length) {
          await manager.save(
            plan.create.map((s) => manager.create(ProductSopStep, { ...s, sopId: sop.id })),
          );
        }
      }
    });

    const result = await this.findOne(productId, sop.id, actorId);
    if (dto.steps) {
      const added = mentionsIn(dto.steps).filter((id) => !previousMentions.includes(id));
      await this.notifyMentions(product, result, added, actorId);
    }
    return result;
  }

  async remove(productId: string, sopId: string) {
    await this.getProduct(productId);
    const sop = await this.getSop(productId, sopId, false);
    await this.sopsRepo.delete(sop.id);
    return { success: true };
  }

  async appendStep(productId: string, sopId: string, dto: CreateSopStepDto, actorId: string) {
    const product = await this.getProduct(productId);
    const sop = await this.getSop(productId, sopId, true);
    const previousMentions = mentionsIn(sop.steps);
    const maxPosition = sop.steps.reduce((m, s) => Math.max(m, s.position), 0);

    await this.stepsRepo.save(
      this.stepsRepo.create({
        sopId: sop.id,
        position: maxPosition + 1,
        text: dto.text.trim(),
        links: dto.links ?? [],
      }),
    );
    await this.sopsRepo.update({ id: sop.id }, { updatedAt: new Date() });

    const result = await this.findOne(productId, sop.id, actorId);
    const added = extractMentionIds(dto.text).filter((id) => !previousMentions.includes(id));
    await this.notifyMentions(product, result, added, actorId);
    return result;
  }

  async setProgress(
    productId: string,
    sopId: string,
    stepId: string,
    dto: SetSopStepProgressDto,
    userId: string,
  ) {
    await this.getProduct(productId);
    const sop = await this.getSop(productId, sopId, false);
    const step = await this.stepsRepo.findOne({ where: { id: stepId, sopId: sop.id } });
    if (!step) throw new NotFoundException('Step not found.');

    if (dto.done) {
      await this.progressRepo
        .createQueryBuilder()
        .insert()
        .into(ProductSopProgress)
        .values({ stepId: step.id, userId })
        .orIgnore()
        .execute();
    } else {
      await this.progressRepo.delete({ stepId: step.id, userId });
    }

    const completedStepIds = await this.completedStepIds(sop.id, userId);
    return { stepId: step.id, done: dto.done, completedStepIds };
  }

  // ---- helpers ----

  private async getProduct(productId: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async getSop(productId: string, sopId: string, withSteps: boolean): Promise<ProductSop> {
    const sop = await this.sopsRepo.findOne({
      where: { id: sopId, productId },
      relations: withSteps ? ['steps'] : [],
    });
    if (!sop) throw new NotFoundException('SOP not found.');
    return sop;
  }

  private async assertUserExists(userId: string, message: string) {
    const exists = await this.usersRepo.exists({ where: { id: userId } });
    if (!exists) throw new BadRequestException(message);
  }

  private async completedStepIds(sopId: string, userId: string): Promise<string[]> {
    const rows = await this.progressRepo
      .createQueryBuilder('p')
      .innerJoin(ProductSopStep, 's', 's.id = p.stepId')
      .where('s.sopId = :sopId', { sopId })
      .andWhere('p.userId = :userId', { userId })
      .select('p.stepId', 'stepId')
      .getRawMany<{ stepId: string }>();
    return rows.map((r) => r.stepId);
  }

  private async present(sops: ProductSop[], userId: string) {
    const ownerIds = [...new Set(sops.map((s) => s.ownerId).filter((id): id is string => !!id))];
    const owners = ownerIds.length
      ? await this.usersRepo.find({ where: { id: In(ownerIds) }, select: SAFE_USER_FIELDS })
      : [];
    const ownerById = new Map<string, SafeUser>(
      owners.map((u) => [u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: u.role }]),
    );

    const stepIds = sops.flatMap((s) => (s.steps ?? []).map((st) => st.id));
    const done = stepIds.length
      ? await this.progressRepo.find({
          where: { userId, stepId: In(stepIds) },
          select: ['stepId'],
        })
      : [];
    const doneSet = new Set(done.map((p) => p.stepId));

    return sops.map((sop) => {
      const steps = [...(sop.steps ?? [])]
        .sort((a, b) => a.position - b.position)
        .map(({ id, position, text, links }) => ({ id, position, text, links: links ?? [] }));
      return {
        id: sop.id,
        productId: sop.productId,
        title: sop.title,
        audience: sop.audience,
        ownerId: sop.ownerId,
        owner: sop.ownerId ? ownerById.get(sop.ownerId) ?? null : null,
        steps,
        completedStepIds: steps.filter((s) => doneSet.has(s.id)).map((s) => s.id),
        createdAt: sop.createdAt,
        updatedAt: sop.updatedAt,
      };
    });
  }

  private async notifyMentions(
    product: Product,
    sop: { id: string; title: string; steps: { text: string }[] },
    userIds: string[],
    actorId: string,
  ) {
    const targets = userIds.filter((id) => id !== actorId);
    if (!targets.length) return;
    const [actor, existing] = await Promise.all([
      this.usersRepo.findOne({ where: { id: actorId }, select: ['id', 'name'] }),
      this.usersRepo.find({ where: { id: In(targets) }, select: ['id'] }),
    ]);
    const actorName = actor?.name || 'Someone';
    const link = `/products/${product.slug}/sops?sop=${sop.id}`;
    for (const { id } of existing) {
      const step = sop.steps.find((s) => extractMentionIds(s.text).includes(id));
      const excerpt = step ? stripMentionMarkup(step.text).trim().slice(0, 500) : '';
      try {
        await this.notificationsService.create({
          type: NotificationType.PRODUCT_MENTION,
          title: `${actorName} mentioned you in the SOP "${sop.title}"`,
          message: excerpt ? `${product.name} · ${excerpt}` : product.name,
          userId: id,
          productId: product.id,
          link,
        });
      } catch (err) {
        this.logger.warn(`SOP mention notification failed: ${(err as Error).message}`);
      }
    }
  }
}
