import 'multer';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Form, FormStatus } from './entities/form.entity';
import { FormResponse } from './entities/form-response.entity';
import { FormFile, FormFileSource } from './entities/form-file.entity';
import { Project } from '../projects/entities/project.entity';
import { IcebergService, IcebergUploadResult } from '../shared/iceberg.service';
import { HubUsersService, SafeUser } from '../products/hub-users.service';
import { decodeFilename } from '../products/product-files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { CreateFormDto, SubmitFormDto, UpdateFormDto } from './dto/form.dto';
import { AnswerFile, DEFAULT_SETTINGS, FormItem, QuestionItem } from './forms.types';
import {
  assertPublishable,
  normalizeItems,
  normalizeSettings,
  referencedFileIds,
  remapImageFiles,
  validateSubmission,
} from './forms.logic';

export const MAX_FILES_PER_REQUEST = 10;
export const MAX_BUILDER_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_RESPONDENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Respondent uploads per form per hour, so a public link can't be used to fill storage. */
export const MAX_RESPONDENT_FILES_PER_HOUR = 50;

// SVG is left out on purpose: it can carry scripts and is served from the public CDN.
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const RESPONDENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

const TOKEN = /^[a-f0-9]{64}$/;
const newToken = () => randomBytes(32).toString('hex');

export type ListScope = 'mine' | 'all' | 'templates';

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectRepository(Form) private readonly forms: Repository<Form>,
    @InjectRepository(FormResponse) private readonly responses: Repository<FormResponse>,
    @InjectRepository(FormFile) private readonly files: Repository<FormFile>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly iceberg: IcebergService,
    private readonly users: HubUsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- shapes returned to the dashboard

  private async projectNames(
    ids: (string | null)[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const rows = await this.projects.find({
      select: ['id', 'clientName'],
      where: { id: In(unique) },
    });
    return new Map(rows.map((p) => [p.id, { id: p.id, name: p.clientName }]));
  }

  private async responseStats(
    formIds: string[],
  ): Promise<Map<string, { count: number; lastAt: string | null }>> {
    if (formIds.length === 0) return new Map();
    const rows: { formId: string; count: string; lastAt: Date | null }[] = await this.responses
      .createQueryBuilder('r')
      .select('r.formId', 'formId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(r.submittedAt)', 'lastAt')
      .where('r.formId IN (:...formIds)', { formIds })
      .groupBy('r.formId')
      .getRawMany();
    return new Map(
      rows.map((r) => [
        r.formId,
        { count: Number(r.count), lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null },
      ]),
    );
  }

  private summary(
    form: Form,
    users: Map<string, SafeUser>,
    projects: Map<string, { id: string; name: string }>,
    stats: Map<string, { count: number; lastAt: string | null }>,
  ) {
    return {
      id: form.id,
      title: form.title,
      description: form.description,
      status: form.status,
      isTemplate: form.isTemplate,
      publicToken: form.publicToken,
      owner: (form.ownerId && users.get(form.ownerId)) || null,
      project: (form.projectId && projects.get(form.projectId)) || null,
      questionCount: (form.items || []).filter((i) => i.type === 'question').length,
      responseCount: stats.get(form.id)?.count ?? 0,
      lastResponseAt: stats.get(form.id)?.lastAt ?? null,
      publishedAt: form.publishedAt,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }

  private async detail(form: Form) {
    const [users, projects, stats] = await Promise.all([
      this.users.load([form.ownerId]),
      this.projectNames([form.projectId]),
      this.responseStats([form.id]),
    ]);
    return {
      ...this.summary(form, users, projects, stats),
      items: form.items || [],
      settings: normalizeSettings(undefined, form.settings),
    };
  }

  private fileResponse(file: FormFile): AnswerFile {
    return {
      id: file.id,
      name: file.name,
      url: file.url,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes == null ? null : Number(file.sizeBytes),
    };
  }

  // ---- team routes

  async findOrFail(id: string): Promise<Form> {
    const form = await this.forms.findOne({ where: { id, deletedAt: IsNull() } });
    if (!form) throw new NotFoundException('Form not found.');
    return form;
  }

  async list(scope: ListScope, q: string | undefined, actorId: string) {
    const qb = this.forms.createQueryBuilder('f').where('f.deletedAt IS NULL');
    if (scope === 'templates') qb.andWhere('f.isTemplate = true');
    else qb.andWhere('f.isTemplate = false');
    if (scope === 'mine') qb.andWhere('f.ownerId = :actorId', { actorId });
    const search = (q || '').trim();
    if (search) qb.andWhere('f.title ILIKE :q', { q: `%${search.replace(/[\\%_]/g, '\\$&')}%` });
    const forms = await qb.orderBy('f.updatedAt', 'DESC').take(500).getMany();

    const [users, projects, stats] = await Promise.all([
      this.users.load(forms.map((f) => f.ownerId)),
      this.projectNames(forms.map((f) => f.projectId)),
      this.responseStats(forms.map((f) => f.id)),
    ]);
    return forms.map((f) => this.summary(f, users, projects, stats));
  }

  async get(id: string) {
    return this.detail(await this.findOrFail(id));
  }

  private async assertProject(projectId: string) {
    const exists = await this.projects.exist({ where: { id: projectId } });
    if (!exists) throw new BadRequestException('That project no longer exists.');
  }

  async create(dto: CreateFormDto, actorId: string) {
    if (dto.projectId) await this.assertProject(dto.projectId);

    if (dto.fromTemplateId) {
      const source = await this.findOrFail(dto.fromTemplateId);
      const copy = await this.copyForm(source, {
        title: dto.title || source.title,
        isTemplate: false,
        ownerId: actorId,
        projectId: dto.projectId ?? null,
      });
      return this.detail(copy);
    }

    const firstQuestion: QuestionItem = {
      id: `q-${randomBytes(4).toString('hex')}`,
      type: 'question',
      kind: 'short_text',
      title: 'Untitled question',
      description: '',
      required: false,
      options: [],
      allowOther: false,
    };
    const form = await this.forms.save(
      this.forms.create({
        title: dto.title || 'Untitled form',
        description: '',
        ownerId: actorId,
        projectId: dto.projectId ?? null,
        isTemplate: false,
        status: FormStatus.DRAFT,
        items: [firstQuestion],
        settings: { ...DEFAULT_SETTINGS },
      }),
    );
    return this.detail(form);
  }

  /**
   * Copies a form with its builder images. The copy is a new draft with no link;
   * its file rows point at the same Iceberg assets as the source.
   */
  private async copyForm(
    source: Form,
    overrides: { title: string; isTemplate: boolean; ownerId: string; projectId: string | null },
  ): Promise<Form> {
    return this.dataSource.transaction(async (manager) => {
      const forms = manager.getRepository(Form);
      const files = manager.getRepository(FormFile);

      const form = await forms.save(
        forms.create({
          title: overrides.title.slice(0, 200),
          description: source.description,
          ownerId: overrides.ownerId,
          projectId: overrides.projectId,
          isTemplate: overrides.isTemplate,
          status: FormStatus.DRAFT,
          items: [],
          settings: normalizeSettings(undefined, source.settings),
        }),
      );

      const ids = referencedFileIds(source.items || []);
      const originals = ids.length
        ? await files.find({
            where: { id: In(ids), formId: source.id, source: FormFileSource.BUILDER },
          })
        : [];
      const copied = new Map<string, { id: string; url: string }>();
      for (const original of originals) {
        const row = await files.save(
          files.create({
            formId: form.id,
            responseId: null,
            source: original.source,
            name: original.name,
            url: original.url,
            storageKey: original.storageKey,
            contentType: original.contentType,
            sizeBytes: original.sizeBytes,
          }),
        );
        copied.set(original.id, { id: row.id, url: row.url });
      }

      form.items = remapImageFiles(source.items || [], copied);
      return forms.save(form);
    });
  }

  async update(id: string, dto: UpdateFormDto) {
    const form = await this.findOrFail(id);

    if (dto.title !== undefined) {
      if (!dto.title) throw new BadRequestException('Give the form a title.');
      form.title = dto.title;
    }
    if (dto.description !== undefined) form.description = dto.description;
    if (dto.projectId !== undefined) {
      if (dto.projectId) await this.assertProject(dto.projectId);
      form.projectId = dto.projectId || null;
    }
    if (dto.items !== undefined) {
      const builderFiles = await this.files.find({
        select: ['id', 'url'],
        where: { formId: form.id, source: FormFileSource.BUILDER },
      });
      form.items = normalizeItems(dto.items, new Map(builderFiles.map((f) => [f.id, f.url])));
    }
    if (dto.settings !== undefined) form.settings = normalizeSettings(dto.settings, form.settings);

    return this.detail(await this.forms.save(form));
  }

  /** Soft delete: the form disappears and its public link stops working; responses and files are kept. */
  async remove(id: string) {
    const form = await this.findOrFail(id);
    form.deletedAt = new Date();
    form.publicToken = null;
    if (form.status === FormStatus.OPEN) form.status = FormStatus.CLOSED;
    await this.forms.save(form);
    return { success: true };
  }

  async duplicate(id: string, actorId: string) {
    const source = await this.findOrFail(id);
    const copy = await this.copyForm(source, {
      title: `Copy of ${source.title}`,
      isTemplate: source.isTemplate,
      ownerId: actorId,
      projectId: source.projectId,
    });
    return this.detail(copy);
  }

  async saveAsTemplate(id: string, actorId: string) {
    const source = await this.findOrFail(id);
    const copy = await this.copyForm(source, {
      title: source.title,
      isTemplate: true,
      ownerId: actorId,
      projectId: null,
    });
    return this.detail(copy);
  }

  async publish(id: string) {
    const form = await this.findOrFail(id);
    if (form.isTemplate) {
      throw new BadRequestException(
        "Templates can't be published. Create a form from this template first.",
      );
    }
    assertPublishable(form.items || []);
    form.status = FormStatus.OPEN;
    form.publicToken = form.publicToken || newToken();
    form.publishedAt = form.publishedAt || new Date();
    return this.detail(await this.forms.save(form));
  }

  async close(id: string) {
    const form = await this.findOrFail(id);
    if (form.status !== FormStatus.OPEN)
      throw new BadRequestException('Only an open form can be closed.');
    form.status = FormStatus.CLOSED;
    return this.detail(await this.forms.save(form));
  }

  async reopen(id: string) {
    const form = await this.findOrFail(id);
    if (form.status !== FormStatus.CLOSED)
      throw new BadRequestException('Only a closed form can be reopened.');
    assertPublishable(form.items || []);
    form.status = FormStatus.OPEN;
    return this.detail(await this.forms.save(form));
  }

  /** Replaces the public link; the old one stops working at once. */
  async regenerateLink(id: string) {
    const form = await this.findOrFail(id);
    if (!form.publicToken) throw new BadRequestException('Publish the form first to get a link.');
    form.publicToken = newToken();
    return this.detail(await this.forms.save(form));
  }

  async uploadBuilderFiles(id: string, uploads: Express.Multer.File[]) {
    const form = await this.findOrFail(id);
    const saved = await this.storeFiles(
      form.id,
      uploads,
      FormFileSource.BUILDER,
      IMAGE_TYPES,
      MAX_BUILDER_FILE_BYTES,
    );
    return saved.map((f) => this.fileResponse(f));
  }

  async listResponses(id: string) {
    const form = await this.findOrFail(id);
    return this.responses.find({ where: { formId: form.id }, order: { submittedAt: 'DESC' } });
  }

  async deleteResponse(id: string, responseId: string) {
    const form = await this.findOrFail(id);
    const response = await this.responses.findOne({ where: { id: responseId, formId: form.id } });
    if (!response) throw new NotFoundException('Response not found.');
    const attached = await this.files.find({ where: { responseId: response.id } });
    await this.dataSource.transaction(async (manager) => {
      if (attached.length)
        await manager.getRepository(FormFile).delete({ id: In(attached.map((f) => f.id)) });
      await manager.getRepository(FormResponse).delete(response.id);
    });
    await this.releaseAssets(attached.map((f) => f.storageKey));
    return { success: true };
  }

  // ---- files

  /** Uploads to Iceberg, then saves rows; if anything fails, assets already uploaded are removed again. */
  private async storeFiles(
    formId: string,
    uploads: Express.Multer.File[],
    source: FormFileSource,
    allowedTypes: string[],
    maxBytes: number,
  ): Promise<FormFile[]> {
    if (!uploads || uploads.length === 0) throw new BadRequestException('Choose a file to upload.');
    if (uploads.length > MAX_FILES_PER_REQUEST) {
      throw new BadRequestException(
        `You can upload up to ${MAX_FILES_PER_REQUEST} files at a time.`,
      );
    }
    for (const file of uploads) {
      const name = decodeFilename(file.originalname);
      if (!allowedTypes.includes(file.mimetype)) {
        const kinds =
          source === FormFileSource.BUILDER
            ? 'PNG, JPG, GIF or WebP images'
            : 'images (PNG, JPG, GIF, WebP) or PDFs';
        throw new BadRequestException(`${name} can't be uploaded. Use ${kinds}.`);
      }
      if (file.size > maxBytes) {
        throw new BadRequestException(
          `${name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        );
      }
    }

    const uploaded: { file: Express.Multer.File; name: string; result: IcebergUploadResult }[] = [];
    try {
      for (const file of uploads) {
        const name = decodeFilename(file.originalname);
        try {
          uploaded.push({ file, name, result: await this.iceberg.upload(file, `forms/${formId}`) });
        } catch (error) {
          if (error instanceof HttpException) throw error;
          this.logger.error(`Iceberg upload failed for ${name}: ${error?.message || error}`);
          throw new ServiceUnavailableException(
            `Upload failed for ${name}. Try again in a minute.`,
          );
        }
      }
      return await this.files.save(
        uploaded.map((u) =>
          this.files.create({
            formId,
            responseId: null,
            source,
            name: u.name.slice(0, 255),
            url: u.result.url,
            storageKey: u.result.key,
            contentType: u.result.contentType || u.file.mimetype || null,
            sizeBytes: String(u.result.sizeBytes ?? u.file.size ?? 0),
          }),
        ),
      );
    } catch (error) {
      await this.releaseAssets(uploaded.map((u) => u.result.key));
      throw error;
    }
  }

  /** Deletes Iceberg assets that no form_files row points at any more (copies of a form share keys). */
  private async releaseAssets(keys: string[]) {
    for (const key of new Set(keys)) {
      try {
        const stillUsed = await this.files.exist({ where: { storageKey: key } });
        if (!stillUsed) await this.iceberg.deleteAsset(key);
      } catch (error) {
        this.logger.warn(`Could not remove Iceberg asset ${key}: ${error?.message || error}`);
      }
    }
  }

  // ---- public routes (the token is the credential)

  private async findByToken(token: string): Promise<Form> {
    const form = TOKEN.test(token)
      ? await this.forms.findOne({
          where: { publicToken: token, deletedAt: IsNull(), isTemplate: false },
        })
      : null;
    if (!form || form.status === FormStatus.DRAFT) {
      throw new NotFoundException(
        "This form doesn't exist, or its link has changed. Ask for a new link.",
      );
    }
    return form;
  }

  private async findOpenByToken(token: string): Promise<Form> {
    const form = await this.findByToken(token);
    if (form.status !== FormStatus.OPEN)
      throw new BadRequestException('This form is closed and no longer accepts responses.');
    return form;
  }

  /** Only what a respondent needs: no owner, project, token or internal ids beyond item ids. */
  async getPublic(token: string) {
    const form = await this.findByToken(token);
    if (form.status === FormStatus.CLOSED) return { status: form.status, title: form.title };
    const settings = normalizeSettings(undefined, form.settings);
    return {
      status: form.status,
      title: form.title,
      description: form.description,
      items: (form.items || []).map(
        (item): FormItem => (item.type === 'image' ? { ...item, fileId: null } : item),
      ),
      settings: { collectName: settings.collectName, collectEmail: settings.collectEmail },
    };
  }

  async uploadRespondentFiles(token: string, uploads: Express.Multer.File[]) {
    const form = await this.findOpenByToken(token);
    const recent = await this.files.count({
      where: {
        formId: form.id,
        source: FormFileSource.RESPONDENT,
        createdAt: MoreThan(new Date(Date.now() - 60 * 60 * 1000)),
      },
    });
    if (recent + (uploads?.length || 0) > MAX_RESPONDENT_FILES_PER_HOUR) {
      throw new HttpException(
        'Too many uploads for this form right now. Try again in an hour.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const saved = await this.storeFiles(
      form.id,
      uploads,
      FormFileSource.RESPONDENT,
      RESPONDENT_TYPES,
      MAX_RESPONDENT_FILE_BYTES,
    );
    return saved.map((f) => this.fileResponse(f));
  }

  async submit(token: string, dto: SubmitFormDto) {
    const form = await this.findOpenByToken(token);
    const settings = normalizeSettings(undefined, form.settings);

    const unattached = await this.files.find({
      where: { formId: form.id, source: FormFileSource.RESPONDENT, responseId: IsNull() },
    });
    const valid = validateSubmission(
      form.items || [],
      settings,
      dto,
      new Map(unattached.map((f) => [f.id, this.fileResponse(f)])),
    );

    const response = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.getRepository(FormResponse).save(
        manager.getRepository(FormResponse).create({
          formId: form.id,
          answers: valid.answers,
          respondentName: valid.respondentName,
          respondentEmail: valid.respondentEmail,
        }),
      );
      if (valid.fileIds.length) {
        await manager
          .getRepository(FormFile)
          .update({ id: In(valid.fileIds) }, { responseId: saved.id });
      }
      return saved;
    });

    await this.notifyResponse(form, response);
    return { confirmationMessage: settings.confirmationMessage };
  }

  /** Tells the form's owner and the linked project's PM. A failed notification never fails the submission. */
  private async notifyResponse(form: Form, response: FormResponse) {
    try {
      const project = form.projectId
        ? await this.projects.findOne({
            select: ['id', 'clientName', 'pmId'],
            where: { id: form.projectId },
          })
        : null;
      const recipients = [
        ...new Set([form.ownerId, project?.pmId].filter((id): id is string => !!id)),
      ];
      const who = response.respondentName || response.respondentEmail || 'Someone';
      const forProject = project ? ` for ${project.clientName}` : '';
      for (const userId of recipients) {
        try {
          await this.notifications.create({
            type: NotificationType.FORM_RESPONSE,
            title: 'New form response',
            message: `${who} submitted "${form.title}"${forProject}.`,
            userId,
            projectId: form.projectId ?? undefined,
            link: `/forms/${form.id}/responses`,
          });
        } catch (error) {
          this.logger.warn(
            `Form response notification for user ${userId} failed: ${error?.message || error}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Form response notifications for form ${form.id} failed: ${error?.message || error}`,
      );
    }
  }
}
