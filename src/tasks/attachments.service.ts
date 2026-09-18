import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TaskAttachment } from './entities/task-attachment.entity';
import { User } from '../users/entities/user.entity';
import { IcebergService } from '../shared/iceberg.service';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(TaskAttachment)
    private attachmentsRepo: Repository<TaskAttachment>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private icebergService: IcebergService,
  ) {}

  async findByTask(taskId: string): Promise<TaskAttachment[]> {
    return this.attachmentsRepo.find({
      where: { taskId },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });
  }

  async upload(
    taskId: string,
    files: Express.Multer.File[],
    uploadedById: string,
    note?: string,
  ): Promise<TaskAttachment[]> {
    const now = new Date();
    const trimmedNote = note?.trim() || null;

    const saved = await Promise.all(
      files.map(async (file) => {
        const result = await this.icebergService.upload(file, 'PM_tool/task-attachments');
        const attachment = this.attachmentsRepo.create({
          taskId,
          kind: 'file',
          url: result.url,
          filename: file.originalname || null,
          mimeType: file.mimetype || null,
          sizeBytes: result.sizeBytes,
          icebergAssetId: result.assetId,
          icebergKey: result.key,
          uploadedById: uploadedById || null,
          uploadedAt: now,
          note: trimmedNote,
        });
        return this.attachmentsRepo.save(attachment);
      }),
    );

    const ids = saved.map((a) => a.id);
    return this.attachmentsRepo.find({
      where: { id: In(ids) },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });
  }

  async addLink(
    taskId: string,
    url: string,
    label: string | undefined,
    uploadedById: string,
    note?: string,
  ): Promise<TaskAttachment> {
    try {
      new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }

    const filename = label?.trim() || this.deriveFilenameFromUrl(url);

    const attachment = this.attachmentsRepo.create({
      taskId,
      kind: 'link',
      url,
      filename,
      mimeType: null,
      sizeBytes: null,
      icebergAssetId: null,
      icebergKey: null,
      uploadedById: uploadedById || null,
      uploadedAt: new Date(),
      note: note?.trim() || null,
    });

    const saved = await this.attachmentsRepo.save(attachment);
    return this.attachmentsRepo.findOne({
      where: { id: saved.id },
      relations: ['uploadedBy'],
    });
  }

  async delete(attachmentId: string, requestingUserId: string): Promise<{ success: boolean }> {
    const attachment = await this.attachmentsRepo.findOne({
      where: { id: attachmentId },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const user = await this.usersRepo.findOne({
      where: { id: requestingUserId },
      select: ['id', 'role'],
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const isOwner = attachment.uploadedById === requestingUserId;
    const isPrivileged =
      (user.role as string) === 'Project Manager' || (user.role as string) === 'FOUNDER/CEO';

    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException('You do not have permission to delete this attachment');
    }

    // Link attachments have no icebergKey, and neither do rows predating the
    // Iceberg migration (their Cloudinary assets are unreachable anyway). Both
    // go straight to the DB delete — no storage call, no orphan risk.
    if (attachment.icebergKey) {
      await this.icebergService.deleteAsset(attachment.icebergKey);
    }

    try {
      await this.attachmentsRepo.delete(attachmentId);
    } catch (dbError) {
      console.error(
        `[AttachmentsService] CRITICAL: Iceberg asset deleted (key: ${attachment.icebergKey}) ` +
          `but DB row ${attachmentId} could not be removed — row is now orphaned.`,
        dbError,
      );
      throw dbError;
    }
    return { success: true };
  }

  private deriveFilenameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace(/^www\./, '');
      const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
      return lastSegment || hostname;
    } catch {
      return url.substring(0, 100);
    }
  }
}
