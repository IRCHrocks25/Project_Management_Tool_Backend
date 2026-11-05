import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { ProductFilesService } from '../products/product-files.service';
import { ProductsService } from '../products/products.service';
import { ProductVaultService } from '../product-vault/product-vault.service';
import { CompanyVaultService } from '../product-vault/company-vault.service';
import { ProjectsService } from '../projects/projects.service';
import { AttachmentsService } from '../tasks/attachments.service';
import { TaskStatus } from '../tasks/entities/task.entity';
import { TasksService } from '../tasks/tasks.service';
import {
  ASSISTANT_TOOLS,
  STAGE_IDS,
  STAGE_LABEL,
  StageId,
  SYSTEM_PROMPT,
  TASK_TYPES,
  WRITE_TOOLS,
  isAllowedPagePath,
} from './assistant.tools';
import {
  AssistantConversation,
  AssistantFile,
  AssistantMemory,
  AssistantMessage,
  PendingAction,
} from './entities/assistant.entities';

export const ASSISTANT_MODEL = 'claude-opus-5-5';
const MAX_LOOP_STEPS = 10;
const MAX_INLINE_FILE_BYTES = 5 * 1024 * 1024;
const INLINE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const RATE_LIMIT_PER_MINUTE = 30;

export interface AssistantUser {
  userId: string;
  role: string;
  name?: string;
}

/** Instructions for the chat panel. Never stored or sent to the model. */
export type ClientAction =
  | { type: 'navigate'; path: string; label: string }
  | { type: 'vault_link'; label: string; url: string; expiresAt: Date; oneTime: boolean };

export interface AssistantReply {
  conversationId: string;
  text: string;
  actions: ClientAction[];
  pending: { id: string; summary: string }[];
}

const STATUS_BY_STAGE: Record<StageId, { status: TaskStatus; marker?: string; done: boolean }> = {
  not_started: { status: TaskStatus.TODO, done: false },
  owned_in_progress: { status: TaskStatus.IN_PROGRESS, done: false },
  for_approval: { status: TaskStatus.IN_REVIEW, marker: '\n\n--- Column: For Approval ---', done: false },
  revision: { status: TaskStatus.IN_REVIEW, marker: '\n\n--- Column: Revision ---', done: false },
  qa_before_client: { status: TaskStatus.IN_REVIEW, marker: '\n\n--- Column: QA Review ---', done: false },
  client_validation: { status: TaskStatus.IN_REVIEW, marker: '\n\n--- Column: Client Validation ---', done: false },
  approved_completed: { status: TaskStatus.COMPLETED, done: true },
};

const stageOf = (t: any): string => {
  if (t.isCompleted || t.status === TaskStatus.COMPLETED) return 'Completed';
  const d: string = t.description || '';
  if (d.includes('--- Column: Revision ---')) return 'Changes requested';
  if (d.includes('--- Column: QA Review ---')) return 'QA review';
  if (d.includes('--- Column: Client Validation ---') || d.includes('--- Column: Client Review ---')) return 'Client validation';
  if (d.includes('--- Column: For Approval ---') || t.status === TaskStatus.IN_REVIEW) return 'Awaiting approval';
  if (t.status === TaskStatus.BLOCKED) return 'Blocked';
  return t.assignedToId ? 'In progress' : 'Not started';
};

const textOf = (content: any[]): string =>
  (content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

@Injectable()
export class AssistantService {
  /** Replaced in tests. */
  clientFactory: () => any = () => new Anthropic();
  private readonly recentCalls = new Map<string, number[]>();

  constructor(
    @InjectRepository(AssistantConversation) private readonly conversations: Repository<AssistantConversation>,
    @InjectRepository(AssistantMessage) private readonly messages: Repository<AssistantMessage>,
    @InjectRepository(AssistantMemory) private readonly memories: Repository<AssistantMemory>,
    @InjectRepository(AssistantFile) private readonly files: Repository<AssistantFile>,
    private readonly config: ConfigService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly authService: AuthService,
    private readonly productsService: ProductsService,
    private readonly productFiles: ProductFilesService,
    private readonly vault: ProductVaultService,
    private readonly companyVault: CompanyVaultService,
  ) {}

  // ------------------------------------------------------------ public API

  async listConversations(user: AssistantUser) {
    return this.conversations.find({
      select: ['id', 'title', 'updatedAt'],
      where: { userId: user.userId },
      order: { updatedAt: 'DESC' },
      take: 30,
    });
  }

  async getConversation(id: string, user: AssistantUser) {
    const conversation = await this.ownedConversation(id, user);
    const rows = await this.messages.find({ where: { conversationId: id }, order: { seq: 'ASC' } });
    return {
      id: conversation.id,
      title: conversation.title,
      messages: rows.filter((r) => r.displayText).map((r) => ({ id: r.id, role: r.role, text: r.displayText })),
      pending: (conversation.pendingState?.actions || []).map((a) => ({ id: a.toolUseId, summary: a.summary })),
    };
  }

  async saveFile(file: Express.Multer.File, user: AssistantUser) {
    if (!file) throw new BadRequestException('Choose a file to attach.');
    const saved = await this.files.save(
      this.files.create({
        userId: user.userId,
        fileName: file.originalname.slice(0, 255),
        mimeType: (file.mimetype || 'application/octet-stream').slice(0, 120),
        size: file.size,
        data: file.buffer,
      }),
    );
    return { id: saved.id, fileName: saved.fileName, size: saved.size };
  }

  async chat(
    input: { conversationId?: string; message: string; fileIds?: string[]; page?: string; localTime?: string },
    user: AssistantUser,
  ): Promise<AssistantReply> {
    this.assertReady(user);
    user = await this.withName(user);
    const message = (input.message || '').trim();
    if (!message && !input.fileIds?.length) throw new BadRequestException('Type a message first.');

    const conversation = input.conversationId
      ? await this.ownedConversation(input.conversationId, user)
      : await this.conversations.save(
          this.conversations.create({ userId: user.userId, title: message.slice(0, 80) || 'New chat', pendingState: null }),
        );

    // Every tool call needs an answer, so moving on without confirming declines what was waiting.
    if (conversation.pendingState) {
      const declined = conversation.pendingState.actions.map((a) => this.toolResult(a.toolUseId, 'The user moved on without confirming, so this was not done.'));
      await this.appendMessage(conversation.id, 'user', [...conversation.pendingState.results, ...declined], null);
      conversation.pendingState = null;
      await this.conversations.save(conversation);
    }

    const files = await this.ownedFiles(input.fileIds || [], user);
    const blocks: any[] = [{ type: 'text', text: await this.contextBlock(user, input.page, input.localTime) }];
    files.forEach((f) => {
      blocks.push({ type: 'assistant_file', fileId: f.id });
      blocks.push({ type: 'text', text: `Attached file: "${f.fileName}" (fileId: ${f.id}, ${f.mimeType}, ${f.size} bytes).` });
    });
    blocks.push({ type: 'text', text: message || 'See the attached file.' });
    const shown = [message, ...files.map((f) => `📎 ${f.fileName}`)].filter(Boolean).join('\n');
    await this.appendMessage(conversation.id, 'user', blocks, shown);

    return this.runLoop(conversation, user, []);
  }

  async decide(conversationId: string, decisions: Record<string, 'approve' | 'reject'>, user: AssistantUser): Promise<AssistantReply> {
    this.assertReady(user);
    user = await this.withName(user);
    const conversation = await this.ownedConversation(conversationId, user);
    const state = conversation.pendingState;
    if (!state) throw new BadRequestException('Nothing is waiting for your confirmation.');

    const results = [...state.results];
    for (const action of state.actions) {
      if (decisions?.[action.toolUseId] === 'approve') {
        results.push(await this.runSafely(action.toolUseId, () => this.runWriteTool(action, user)));
      } else {
        results.push(this.toolResult(action.toolUseId, 'The user declined, so this was not done.'));
      }
    }
    conversation.pendingState = null;
    await this.conversations.save(conversation);
    await this.appendMessage(conversation.id, 'user', results, null);
    return this.runLoop(conversation, user, []);
  }

  // ------------------------------------------------------------ agent loop

  private async runLoop(conversation: AssistantConversation, user: AssistantUser, actions: ClientAction[]): Promise<AssistantReply> {
    const client = this.clientFactory();
    let lastText = '';

    for (let step = 0; step < MAX_LOOP_STEPS; step++) {
      const response = await this.callModel(client, conversation.id);
      const text = textOf(response.content);
      if (text) lastText = text;
      await this.appendMessage(conversation.id, 'assistant', response.content, text || null);

      if (response.stop_reason === 'refusal') {
        return this.finish(conversation, lastText || "Sorry, I can't help with that one.", actions);
      }
      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') return this.finish(conversation, lastText, actions);

      const calls = response.content.filter((b: any) => b.type === 'tool_use');
      const writes = calls.filter((c: any) => WRITE_TOOLS.has(c.name));
      const reads = calls.filter((c: any) => !WRITE_TOOLS.has(c.name));
      const results = await Promise.all(
        reads.map((c: any) => this.runSafely(c.id, () => this.runReadTool(c.name, c.input, user, actions))),
      );

      if (writes.length > 0) {
        const pending: PendingAction[] = [];
        for (const call of writes) {
          pending.push({ toolUseId: call.id, name: call.name, input: call.input, summary: await this.describe(call.name, call.input, user) });
        }
        conversation.pendingState = { results, actions: pending };
        await this.conversations.save(conversation);
        return {
          conversationId: conversation.id,
          text: lastText,
          actions,
          pending: pending.map((a) => ({ id: a.toolUseId, summary: a.summary })),
        };
      }
      await this.appendMessage(conversation.id, 'user', results, null);
    }
    return this.finish(conversation, lastText || 'That took more steps than I can do at once. Could you narrow it down?', actions);
  }

  private async callModel(client: any, conversationId: string) {
    const messages = await this.buildMessages(conversationId);
    try {
      return await client.beta.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM_PROMPT,
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new ServiceUnavailableException('The assistant key is not valid. Ask an admin to check ANTHROPIC_API_KEY.');
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new HttpException('The assistant is busy right now. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (error instanceof Anthropic.APIError) {
        console.error('[Assistant] API error', error.status, error.message);
        throw new HttpException('The assistant could not answer just now. Please try again.', HttpStatus.BAD_GATEWAY);
      }
      throw error;
    }
  }

  /** Rows go back exactly as stored; attached files are expanded the same way on every request. */
  private async buildMessages(conversationId: string) {
    const rows = await this.messages.find({ where: { conversationId }, order: { seq: 'ASC' } });
    const output: any[] = [];
    for (const row of rows) {
      const content = await Promise.all(
        row.content.map(async (block: any) => (block.type === 'assistant_file' ? this.fileBlock(block.fileId) : block)),
      );
      output.push({ role: row.role, content: content.filter(Boolean) });
    }
    return output;
  }

  private async fileBlock(fileId: string) {
    const file = await this.files.findOne({ where: { id: fileId }, select: ['id', 'mimeType', 'size', 'data'] });
    if (!file) return { type: 'text', text: 'This attached file is no longer available.' };
    if (file.size > MAX_INLINE_FILE_BYTES) return { type: 'text', text: 'This file is too large for you to read, but it can still be attached.' };
    const data = Buffer.from(file.data).toString('base64');
    if (INLINE_IMAGE_TYPES.includes(file.mimeType)) {
      return { type: 'image', source: { type: 'base64', media_type: file.mimeType, data } };
    }
    if (file.mimeType === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
    }
    return { type: 'text', text: 'You cannot read this file type, but it can still be attached.' };
  }

  private async finish(conversation: AssistantConversation, text: string, actions: ClientAction[]): Promise<AssistantReply> {
    await this.conversations.update(conversation.id, { updatedAt: new Date() });
    return { conversationId: conversation.id, text, actions, pending: [] };
  }

  private toolResult(toolUseId: string, content: unknown, isError = false) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      ...(isError ? { is_error: true } : {}),
    };
  }

  private async runSafely(toolUseId: string, run: () => Promise<unknown>) {
    try {
      return this.toolResult(toolUseId, await run());
    } catch (error: any) {
      if (error instanceof HttpException) return this.toolResult(toolUseId, error.message, true);
      console.error('[Assistant] Tool failed:', error);
      return this.toolResult(toolUseId, 'That did not work because of an unexpected error.', true);
    }
  }

  // ------------------------------------------------------------ read tools

  private async runReadTool(name: string, input: any, user: AssistantUser, actions: ClientAction[]): Promise<unknown> {
    switch (name) {
      case 'search_clients': {
        const query = String(input.query || '').toLowerCase();
        const [projects, tasks] = await Promise.all([this.visibleProjects(user), this.allTasks()]);
        return projects
          .filter((p) => !query || p.clientName?.toLowerCase().includes(query) || p.pm?.name?.toLowerCase().includes(query))
          .slice(0, 25)
          .map((p) => ({
            id: p.id,
            client: p.clientName,
            pm: p.pm?.name || null,
            stage: p.stage,
            priority: p.priority,
            clientType: p.clientType,
            openTasks: tasks.filter((t) => t.projectId === p.id && !t.isCompleted && t.status !== TaskStatus.COMPLETED).length,
          }));
      }
      case 'get_client': {
        const project = await this.visibleProject(input.projectId, user);
        const [tasks, people, team] = await Promise.all([
          this.tasksService.findAll(project.id, undefined, undefined, true),
          this.authService.getAllUsers(),
          this.projectsService.getTeamMembers(project.id).catch(() => []),
        ]);
        const nameOf = (id?: string) => (people as any[]).find((u) => u.id === id)?.name || null;
        return {
          id: project.id,
          client: project.clientName,
          pm: project.pm?.name || nameOf(project.pmId),
          stage: project.stage,
          priority: project.priority,
          clientType: project.clientType,
          team: (team as any[]).map((m) => m.user?.name || m.name).filter(Boolean),
          openTasks: (tasks as any[])
            .filter((t) => !t.isCompleted && t.status !== TaskStatus.COMPLETED)
            .slice(0, 40)
            .map((t) => ({ id: t.id, title: t.title, department: t.type, stage: stageOf(t), owner: nameOf(t.assignedToId), due: t.dueDate })),
        };
      }
      case 'search_tasks': {
        const [projects, tasks, people] = await Promise.all([this.visibleProjects(user), this.allTasks(), this.authService.getAllUsers()]);
        const clientById = new Map<string, string>(projects.map((p) => [p.id, p.clientName]));
        const query = String(input.query || '').toLowerCase();
        const now = Date.now();
        return tasks
          .filter((t) => clientById.has(t.projectId))
          .filter((t) => input.includeCompleted || (!t.isCompleted && t.status !== TaskStatus.COMPLETED))
          .filter((t) => !query || t.title?.toLowerCase().includes(query) || clientById.get(t.projectId)?.toLowerCase().includes(query))
          .filter((t) => !input.projectId || t.projectId === input.projectId)
          .filter((t) => !input.department || t.type === input.department)
          .filter((t) => !input.overdueOnly || (t.dueDate && new Date(t.dueDate).getTime() < now))
          .filter((t) => {
            if (!input.assigneeId) return true;
            const ids = t.assignees?.length ? t.assignees.map((a: any) => a.userId || a.user?.id) : t.assignedToId ? [t.assignedToId] : [];
            return input.assigneeId === 'unassigned' ? ids.length === 0 : ids.includes(input.assigneeId);
          })
          .sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity))
          .slice(0, 25)
          .map((t) => ({
            id: t.id,
            projectId: t.projectId,
            client: clientById.get(t.projectId),
            title: t.title,
            department: t.type,
            stage: stageOf(t),
            owner: (people as any[]).find((u) => u.id === t.assignedToId)?.name || null,
            due: t.dueDate,
          }));
      }
      case 'find_people': {
        const query = String(input.query || '').toLowerCase();
        const people = (await this.authService.getAllUsers()) as any[];
        return people
          .filter((u) => !query || u.name?.toLowerCase().includes(query) || String(u.role || '').toLowerCase().includes(query))
          .slice(0, 25)
          .map((u) => ({ id: u.id, name: u.name, role: u.role }));
      }
      case 'search_products': {
        const query = String(input.query || '').toLowerCase();
        const products = (await this.productsService.list(false)) as any[];
        const people = (await this.authService.getAllUsers()) as any[];
        return products
          .filter((p) => !query || p.name?.toLowerCase().includes(query))
          .slice(0, 25)
          .map((p) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            owner: p.owner?.name || null,
            team: p.members.map((m: any) => people.find((u) => u.id === m.userId)?.name).filter(Boolean),
          }));
      }
      case 'list_vault_items': {
        const items = (await this.vault.listCredentials(input.productId, { userId: user.userId, role: user.role })) as any[];
        // Label and environment only: usernames and URLs stay out of the conversation.
        return items.map((c) => ({ id: c.id, label: c.label, environment: c.environment, shareable: c.shareable, youCanView: c.canReveal }));
      }
      case 'create_vault_link': {
        const expiresIn = input.expiresIn === '24h' ? '24h' : '1h';
        const link = await this.vault.createShare(
          input.productId,
          input.credentialId,
          { expiresIn, oneTime: true },
          { userId: user.userId, role: user.role },
        );
        const items = (await this.vault.listCredentials(input.productId, { userId: user.userId, role: user.role })) as any[];
        const label = items.find((c) => c.id === input.credentialId)?.label || 'Saved login';
        // The link only goes to the panel. The model and the stored chat get this sentence instead.
        actions.push({ type: 'vault_link', label, url: link.url, expiresAt: link.expiresAt, oneTime: link.oneTime });
        return `A one-time link for "${label}" is now showing to the user, valid for ${expiresIn}. You don't have the link; don't try to repeat it.`;
      }
      case 'list_company_logins': {
        // Name and scope only: usernames, notes and URLs stay out of the conversation.
        const items = await this.companyVault.listLabels({ userId: user.userId, role: user.role });
        return items.map((c) => ({ id: c.id, label: c.label, scope: c.scope }));
      }
      case 'create_company_login_link': {
        const link = await this.companyVault.createInternalLink(String(input.itemId || ''), { userId: user.userId, role: user.role });
        // The link only goes to the panel. The model and the stored chat get this sentence instead.
        actions.push({ type: 'vault_link', label: link.label, url: link.url, expiresAt: link.expiresAt, oneTime: link.oneTime });
        return `A one-time link for "${link.label}" is now showing to the user, valid for 1 hour. You don't have the link; don't try to repeat it.`;
      }
      case 'open_page': {
        if (!isAllowedPagePath(input.path)) throw new BadRequestException(`"${input.path}" is not a page I can open.`);
        actions.push({ type: 'navigate', path: input.path, label: String(input.label || 'page').slice(0, 80) });
        return `Opening ${input.label} for the user.`;
      }
      case 'remember_fact': {
        const fact = String(input.fact || '').trim().slice(0, 500);
        if (!fact) throw new BadRequestException('Nothing to remember.');
        const saved = await this.memories.save(this.memories.create({ userId: user.userId, content: fact }));
        return { saved: true, memoryId: saved.id };
      }
      case 'forget_fact': {
        const result = await this.memories.delete({ id: input.memoryId, userId: user.userId });
        return { forgotten: !!result.affected };
      }
      case 'search_past_chats': {
        const rows = await this.messages
          .createQueryBuilder('m')
          .innerJoin(AssistantConversation, 'c', 'c.id = m."conversationId"')
          .select(['m."displayText" AS text', 'm.role AS role', 'm."createdAt" AS at', 'c.title AS chat'])
          .where('c."userId" = :userId', { userId: user.userId })
          .andWhere('m."displayText" ILIKE :query', { query: `%${String(input.query || '').replace(/[%_\\]/g, '\\$&')}%` })
          .orderBy('m."createdAt"', 'DESC')
          .limit(10)
          .getRawMany();
        return rows.map((r) => ({ ...r, text: String(r.text).slice(0, 400) }));
      }
      default:
        throw new BadRequestException(`Unknown tool ${name}.`);
    }
  }

  // ------------------------------------------------------------ write tools (after Confirm)

  private async runWriteTool(action: PendingAction, user: AssistantUser): Promise<unknown> {
    const input = action.input || {};
    switch (action.name) {
      case 'create_task': {
        await this.visibleProject(input.projectId, user);
        if (!TASK_TYPES.includes(input.department)) throw new BadRequestException(`"${input.department}" is not a department.`);
        const title = String(input.title || '').trim();
        if (!title) throw new BadRequestException('A task needs a title.');
        const created: any = await this.tasksService.create(
          {
            projectId: input.projectId,
            title,
            type: input.department,
            description: input.description || '',
            dueDate: input.dueDate ? this.parseDate(input.dueDate) : undefined,
            assignedToId: input.assigneeId || undefined,
          },
          user.userId,
        );
        return { done: true, taskId: created.id, projectId: input.projectId };
      }
      case 'move_task': {
        const task = await this.visibleTask(input.taskId, user);
        if (!STAGE_IDS.includes(input.stage)) throw new BadRequestException('Unknown stage.');
        const stage = input.stage as StageId;
        const target = STATUS_BY_STAGE[stage];
        const reviewIntent = stage === 'revision' ? 'revision' : stage === 'for_approval' ? 'for_approval' : undefined;
        await this.tasksService.updateStatus(task.id, target.status, target.done, undefined, undefined, undefined, user.userId, reviewIntent);
        // Same stage marker and history entry the dashboards write.
        const base = (task.description || '').replace(/\n\n--- Column: [^-]+ ---/g, '');
        let log = `\n\n--- Status Change ---\nNew Column: ${STAGE_LABEL[stage]}\nBy: ${user.name || 'Unknown'} (via assistant)\nAt: ${new Date().toLocaleString()}`;
        if (input.note) log += `\nNotes: ${input.note}`;
        await this.tasksService.update(task.id, {
          description: `${base}${target.marker || ''}${log}`,
          baseDescription: task.description,
        }, user.userId);
        return { done: true, stage: STAGE_LABEL[stage] };
      }
      case 'assign_task': {
        const task = await this.visibleTask(input.taskId, user);
        if (!Array.isArray(input.userIds) || input.userIds.length === 0) throw new BadRequestException('Choose at least one person.');
        await this.tasksService.assignTaskToMultiple(task.id, input.userIds);
        return { done: true };
      }
      case 'set_task_due_date': {
        const task = await this.visibleTask(input.taskId, user);
        await this.tasksService.update(task.id, { dueDate: this.parseDate(input.dueDate) }, user.userId);
        return { done: true };
      }
      case 'add_task_comment': {
        const task = await this.visibleTask(input.taskId, user);
        const text = String(input.text || '').trim();
        if (!text) throw new BadRequestException('The comment is empty.');
        await this.tasksService.createQuestion(task.id, { text }, user.userId);
        return { done: true };
      }
      case 'attach_file': {
        const file = await this.files.findOne({
          where: { id: input.fileId, userId: user.userId },
          select: ['id', 'fileName', 'mimeType', 'size', 'data'],
        });
        if (!file) throw new NotFoundException('That attached file is no longer available.');
        const upload = {
          originalname: file.fileName,
          mimetype: file.mimeType,
          size: file.size,
          buffer: Buffer.from(file.data),
        } as Express.Multer.File;
        if (input.targetType === 'task') {
          const task = await this.visibleTask(input.targetId, user);
          await this.attachmentsService.upload(task.id, [upload], user.userId, input.note || undefined);
        } else if (input.targetType === 'product') {
          await this.productFiles.upload(input.targetId, [upload], input.note || undefined, user.userId);
        } else {
          throw new BadRequestException('A file can go on a task or a product.');
        }
        return { done: true, fileName: file.fileName };
      }
      default:
        throw new BadRequestException(`Unknown action ${action.name}.`);
    }
  }

  /** The sentence on the Confirm card, built from real records rather than the model's wording. */
  private async describe(name: string, input: any, user: AssistantUser): Promise<string> {
    const people = (await this.authService.getAllUsers()) as any[];
    const person = (id: string) => people.find((u) => u.id === id)?.name || 'an unknown person';
    const taskTitle = async () => {
      const task = await this.tasksService.findOne(input.taskId).catch(() => null);
      return task ? `"${task.title}"` : 'this task';
    };
    switch (name) {
      case 'create_task': {
        const project = await this.visibleProject(input.projectId, user).catch(() => null);
        const owner = input.assigneeId ? `, assigned to ${person(input.assigneeId)}` : '';
        const due = input.dueDate ? `, due ${input.dueDate}` : '';
        return `Create task "${input.title}" in ${input.department} for ${project?.clientName || 'this client'}${owner}${due}`;
      }
      case 'move_task':
        return `Move ${await taskTitle()} to ${STAGE_LABEL[input.stage as StageId] || input.stage}`;
      case 'assign_task':
        return `Assign ${await taskTitle()} to ${(input.userIds || []).map(person).join(', ')}`;
      case 'set_task_due_date':
        return `Change the due date of ${await taskTitle()} to ${input.dueDate}`;
      case 'add_task_comment':
        return `Comment on ${await taskTitle()}: "${String(input.text || '').slice(0, 200)}"`;
      case 'attach_file': {
        const file = await this.files.findOne({ where: { id: input.fileId, userId: user.userId }, select: ['id', 'fileName'] });
        let target = 'this item';
        if (input.targetType === 'task') {
          const task = await this.tasksService.findOne(input.targetId).catch(() => null);
          if (task) target = `task "${task.title}"`;
        } else {
          const product = await this.productsService.findOrFail(input.targetId).catch(() => null);
          if (product) target = `product "${product.name}"`;
        }
        return `Attach "${file?.fileName || 'file'}" to ${target}`;
      }
      default:
        return name;
    }
  }

  // ------------------------------------------------------------ helpers

  /** The login token only carries id, email and role. */
  private async withName(user: AssistantUser): Promise<AssistantUser> {
    const record: any = await this.authService.validateUser(user.userId);
    return { ...user, name: record?.name };
  }

  private assertReady(user: AssistantUser) {
    const hasKey = this.config.get('ANTHROPIC_API_KEY') || this.config.get('ANTHROPIC_AUTH_TOKEN');
    if (!hasKey) throw new ServiceUnavailableException("The assistant isn't set up yet. An admin needs to add ANTHROPIC_API_KEY.");
    const now = Date.now();
    const recent = (this.recentCalls.get(user.userId) || []).filter((t) => now - t < 60000);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) {
      throw new HttpException('Too many messages at once. Give it a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.recentCalls.set(user.userId, recent);
  }

  private async contextBlock(user: AssistantUser, page?: string, localTime?: string) {
    const memories = await this.memories.find({ where: { userId: user.userId }, order: { createdAt: 'ASC' }, take: 50 });
    const remembered = memories.length ? memories.map((m) => `- (${m.id}) ${m.content}`).join('\n') : 'Nothing yet.';
    return `<context>\nTheir local date and time: ${String(localTime || new Date().toISOString()).slice(0, 80)}\nPerson: ${user.name || 'Unknown'} (${user.role})\nCurrent page: ${String(page || 'unknown').slice(0, 200)}\nWhat you remember about them:\n${remembered}\n</context>`;
  }

  private async ownedConversation(id: string, user: AssistantUser) {
    const conversation = await this.conversations.findOne({ where: { id } });
    if (!conversation) throw new NotFoundException('Chat not found.');
    if (conversation.userId !== user.userId) throw new ForbiddenException('This chat belongs to someone else.');
    return conversation;
  }

  private async ownedFiles(ids: string[], user: AssistantUser) {
    const files: AssistantFile[] = [];
    for (const id of ids.slice(0, 5)) {
      const file = await this.files.findOne({ where: { id, userId: user.userId } });
      if (!file) throw new NotFoundException('That attached file is no longer available.');
      files.push(file);
    }
    return files;
  }

  private async appendMessage(conversationId: string, role: 'user' | 'assistant', content: any, displayText: string | null) {
    return this.messages.save(this.messages.create({ conversationId, role, content, displayText }));
  }

  private async visibleProjects(user: AssistantUser): Promise<any[]> {
    // Same list the dashboards show: every active project, whatever the role.
    // Passing the PM role here would narrow it to their own projects and hide clients they can see.
    return (await this.projectsService.findAll(user.userId, '', false)) as any[];
  }

  private async visibleProject(projectId: string, user: AssistantUser) {
    const project = (await this.visibleProjects(user)).find((p) => p.id === projectId);
    if (!project) throw new NotFoundException('I could not find that client, or you do not have access to it.');
    return project;
  }

  private async visibleTask(taskId: string, user: AssistantUser): Promise<any> {
    const task: any = await this.tasksService.findOne(taskId);
    await this.visibleProject(task.projectId, user);
    return task;
  }

  private async allTasks(): Promise<any[]> {
    return (await this.tasksService.findAll(undefined, undefined, undefined, true)) as any[];
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new BadRequestException('Dates need to look like 2026-11-30.');
    const date = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('That is not a real date.');
    return date;
  }
}
