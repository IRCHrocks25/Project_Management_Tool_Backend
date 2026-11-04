import 'multer';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ProductUpdate } from './entities/product-update.entity';
import { ProductUpdateComment } from './entities/product-update-comment.entity';
import { Product } from './entities/product.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { extractMentionIds, stripMentionMarkup } from '../shared/mentions';
import { CreateCommentDto, CreateUpdateDto, EditUpdateDto } from './dto/update.dto';
import { HubUsersService, SafeUser, preview } from './hub-users.service';
import { ProductsService } from './products.service';
import { ProductFilesService, UPDATE_FILE_FOLDER, UploadedAsset } from './product-files.service';

const UPDATE_TYPE_LABEL: Record<string, string> = {
  progress: 'a progress update',
  release: 'a release note',
  heads_up: 'a heads-up',
  blocker: 'a blocker',
  question: 'a question',
};

@Injectable()
export class ProductUpdatesService {
  constructor(
    @InjectRepository(ProductUpdate) private readonly updatesRepository: Repository<ProductUpdate>,
    @InjectRepository(ProductUpdateComment) private readonly commentsRepository: Repository<ProductUpdateComment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly products: ProductsService,
    private readonly files: ProductFilesService,
    private readonly hubUsers: HubUsersService,
  ) {}

  private updateLink(product: Product, updateId: string) {
    return `/products/${product.slug}/updates?update=${updateId}`;
  }

  private async findUpdateOrFail(productId: string, updateId: string) {
    const update = await this.updatesRepository.findOne({ where: { id: updateId, productId } });
    if (!update) throw new NotFoundException('Update not found.');
    return update;
  }

  private async decorate(updates: ProductUpdate[]) {
    const ids = updates.map((u) => u.id);
    const [comments, files] = await Promise.all([
      ids.length
        ? this.commentsRepository.find({ where: { updateId: In(ids) }, order: { createdAt: 'ASC' } })
        : Promise.resolve([] as ProductUpdateComment[]),
      this.files.findByUpdateIds(ids),
    ]);
    const users = await this.hubUsers.load([
      ...updates.map((u) => u.authorId),
      ...comments.map((c) => c.authorId),
      ...files.map((f) => f.uploadedById),
    ]);
    return updates.map((u) => ({
      ...u,
      author: users.get(u.authorId) ?? null,
      comments: comments.filter((c) => c.updateId === u.id).map((c) => this.commentResponse(c, users)),
      files: files.filter((f) => f.updateId === u.id).map((f) => this.files.toResponse(f, users)),
    }));
  }

  private commentResponse(c: ProductUpdateComment, users: Map<string, SafeUser>) {
    return { ...c, author: users.get(c.authorId) ?? null };
  }

  async list(productId: string) {
    await this.products.findOrFail(productId);
    const updates = await this.updatesRepository.find({ where: { productId }, order: { createdAt: 'DESC' } });
    return this.decorate(updates);
  }

  private async notifyMentions(
    product: Product,
    actor: SafeUser | null,
    actorId: string,
    userIds: string[],
    where: string,
    body: string,
    updateId: string,
  ) {
    for (const userId of userIds) {
      if (userId === actorId) continue;
      await this.hubUsers.notify({
        type: NotificationType.PRODUCT_MENTION,
        title: `${actor?.name || 'Someone'} mentioned you in ${where} on ${product.name}`,
        message: preview(stripMentionMarkup(body)),
        userId,
        productId: product.id,
        link: this.updateLink(product, updateId),
      });
    }
  }

  async create(productId: string, dto: CreateUpdateDto, uploads: Express.Multer.File[], actorId: string) {
    const product = await this.products.findOrFail(productId);
    const assets: UploadedAsset[] = uploads?.length ? await this.files.uploadAssets(productId, uploads) : [];

    let updateId: string;
    try {
      updateId = await this.dataSource.transaction(async (manager) => {
        const update = await manager.save(
          manager.create(ProductUpdate, { productId, authorId: actorId, type: dto.type, body: dto.body }),
        );
        if (assets.length) {
          await this.files.saveRows(
            this.files.buildRows(productId, assets, { folder: UPDATE_FILE_FOLDER, uploadedById: actorId, updateId: update.id }),
            manager,
          );
        }
        return update.id;
      });
    } catch (error) {
      await this.files.discardAssets(assets);
      throw error;
    }

    const mentions = extractMentionIds(dto.body);
    if (mentions.length) {
      const actor = await this.hubUsers.findOne(actorId);
      await this.notifyMentions(product, actor, actorId, mentions, UPDATE_TYPE_LABEL[dto.type] || 'an update', dto.body, updateId);
    }

    const [decorated] = await this.decorate([await this.findUpdateOrFail(productId, updateId)]);
    return decorated;
  }

  async edit(productId: string, updateId: string, dto: EditUpdateDto, actorId: string) {
    const product = await this.products.findOrFail(productId);
    const update = await this.findUpdateOrFail(productId, updateId);
    const before = extractMentionIds(update.body);
    if (dto.type !== undefined) update.type = dto.type;
    if (dto.body !== undefined) update.body = dto.body;
    update.editedAt = new Date();
    await this.updatesRepository.save(update);

    const added = extractMentionIds(update.body).filter((id) => !before.includes(id));
    if (added.length) {
      const actor = await this.hubUsers.findOne(actorId);
      await this.notifyMentions(product, actor, actorId, added, UPDATE_TYPE_LABEL[update.type] || 'an update', update.body, update.id);
    }
    const [decorated] = await this.decorate([update]);
    return decorated;
  }

  async remove(productId: string, updateId: string) {
    const update = await this.findUpdateOrFail(productId, updateId);
    // Comments cascade; attached files stay in the Files tab (updateId ON DELETE SET NULL).
    await this.updatesRepository.delete(update.id);
    return { success: true };
  }

  async addComment(productId: string, updateId: string, dto: CreateCommentDto, actorId: string) {
    const product = await this.products.findOrFail(productId);
    const update = await this.findUpdateOrFail(productId, updateId);
    const comment = await this.commentsRepository.save(
      this.commentsRepository.create({ updateId, authorId: actorId, body: dto.body }),
    );

    const mentions = extractMentionIds(dto.body);
    const actor = await this.hubUsers.findOne(actorId);
    await this.notifyMentions(product, actor, actorId, mentions, 'a reply', dto.body, update.id);

    if (update.authorId && update.authorId !== actorId && !mentions.includes(update.authorId)) {
      await this.hubUsers.notify({
        type: NotificationType.PRODUCT_REPLY,
        title: `${actor?.name || 'Someone'} replied to your update on ${product.name}`,
        message: preview(stripMentionMarkup(dto.body)),
        userId: update.authorId,
        productId: product.id,
        link: this.updateLink(product, update.id),
      });
    }

    const users = new Map<string, SafeUser>(actor ? [[actor.id, actor]] : []);
    return this.commentResponse(comment, users);
  }

  async removeComment(productId: string, updateId: string, commentId: string, actorId: string) {
    await this.findUpdateOrFail(productId, updateId);
    const comment = await this.commentsRepository.findOne({ where: { id: commentId, updateId } });
    if (!comment) throw new NotFoundException('Reply not found.');
    if (comment.authorId !== actorId) throw new ForbiddenException('You can only delete your own replies.');
    await this.commentsRepository.delete(comment.id);
    return { success: true };
  }
}
