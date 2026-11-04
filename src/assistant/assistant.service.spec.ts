import { AssistantService } from './assistant.service';
import { WRITE_TOOLS, isAllowedPagePath } from './assistant.tools';

const USER = { userId: 'user-1', role: 'Project Manager', name: 'Pat' };
const VAULT_URL = 'https://app.test/share/SECRET-TOKEN';

/** Minimal in-memory stand-in for a TypeORM repository. */
const repo = (rows: any[] = []) => ({
  rows,
  create: (x: any) => ({ ...x }),
  save: async (x: any) => {
    if (!x.id) {
      x.id = `id-${rows.length + 1}`;
      rows.push(x);
    }
    return x;
  },
  find: async ({ where }: any = {}) =>
    rows.filter((r) => !where || Object.entries(where).every(([k, v]) => r[k] === v)),
  findOne: async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null,
  update: async () => undefined,
  delete: async () => ({ affected: 1 }),
});

const setup = (script: any[]) => {
  const requests: any[] = [];
  const conversations = repo();
  const messages = repo();
  const tasksService = {
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => ({ id: 't1', title: 'Homepage', projectId: 'p1', description: '' })),
    updateStatus: jest.fn(async () => undefined),
    update: jest.fn(async () => undefined),
  };
  const vault = {
    createShare: jest.fn(async () => ({ id: 's1', url: VAULT_URL, expiresAt: new Date(), oneTime: true })),
    listCredentials: jest.fn(async () => [{ id: 'c1', label: 'Stripe', canReveal: true, shareable: true, username: 'admin@x.com' }]),
  };
  const service = new AssistantService(
    conversations as any,
    messages as any,
    repo() as any,
    repo() as any,
    { get: () => 'test-key' } as any,
    { findAll: async () => [{ id: 'p1', clientName: 'Sonia Hart' }], getTeamMembers: async () => [] } as any,
    tasksService as any,
    {} as any,
    { getAllUsers: async () => [], validateUser: async () => ({ name: 'Pat' }) } as any,
    {} as any,
    {} as any,
    vault as any,
  );
  service.clientFactory = () => ({
    beta: {
      messages: {
        create: async (req: any) => {
          requests.push(JSON.parse(JSON.stringify(req)));
          return script.shift();
        },
      },
    },
  });
  return { service, requests, tasksService, vault, messages, conversations };
};

const toolUse = (name: string, input: any, id = 'tu1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});
const say = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

describe('AssistantService', () => {
  it('does not change data until the user confirms', async () => {
    const { service, tasksService } = setup([
      toolUse('move_task', { taskId: 't1', stage: 'approved_completed', note: '' }),
      say('Done.'),
    ]);
    const first = await service.chat({ message: 'complete it' }, USER);
    expect(tasksService.updateStatus).not.toHaveBeenCalled();
    expect(first.pending).toEqual([{ id: 'tu1', summary: 'Move "Homepage" to Completed' }]);

    const second = await service.decide(first.conversationId, { tu1: 'approve' }, USER);
    expect(tasksService.updateStatus).toHaveBeenCalledTimes(1);
    expect(second.text).toBe('Done.');
  });

  it('tells the model when the user declines, and changes nothing', async () => {
    const { service, tasksService, requests } = setup([
      toolUse('move_task', { taskId: 't1', stage: 'revision', note: '' }),
      say('Okay, left it.'),
    ]);
    const first = await service.chat({ message: 'x' }, USER);
    await service.decide(first.conversationId, { tu1: 'reject' }, USER);
    expect(tasksService.updateStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[1].messages)).toContain('declined');
  });

  it('declines waiting actions when the user sends a new message instead', async () => {
    const { service, tasksService, requests } = setup([
      toolUse('move_task', { taskId: 't1', stage: 'revision', note: '' }),
      say('Sure.'),
    ]);
    const first = await service.chat({ message: 'x' }, USER);
    await service.chat({ conversationId: first.conversationId, message: 'never mind' }, USER);
    expect(tasksService.updateStatus).not.toHaveBeenCalled();
    expect(JSON.stringify(requests[1].messages)).toContain('moved on');
  });

  it('shows vault links only to the user: never to the model or the stored chat', async () => {
    const { service, requests, messages } = setup([
      toolUse('create_vault_link', { productId: 'pr1', credentialId: 'c1', expiresIn: '1h' }),
      say('Your link is above.'),
    ]);
    const reply = await service.chat({ message: 'stripe password' }, USER);
    expect(reply.actions).toEqual([expect.objectContaining({ type: 'vault_link', url: VAULT_URL, label: 'Stripe' })]);
    expect(JSON.stringify(requests)).not.toContain('SECRET-TOKEN');
    expect(JSON.stringify((messages as any).rows)).not.toContain('SECRET-TOKEN');
  });

  it('forces vault links to be one-time and checks access as the signed-in user', async () => {
    const { service, vault } = setup([
      toolUse('create_vault_link', { productId: 'pr1', credentialId: 'c1', expiresIn: '7d' }),
      say('ok'),
    ]);
    await service.chat({ message: 'x' }, USER);
    expect(vault.createShare).toHaveBeenCalledWith('pr1', 'c1', { expiresIn: '1h', oneTime: true }, { userId: 'user-1', role: USER.role });
  });

  it('keeps usernames out of vault listings', async () => {
    const { service, requests } = setup([toolUse('list_vault_items', { productId: 'pr1' }), say('ok')]);
    await service.chat({ message: 'x' }, USER);
    expect(JSON.stringify(requests[1].messages)).toContain('Stripe');
    expect(JSON.stringify(requests[1].messages)).not.toContain('admin@x.com');
  });

  it('refuses another person\'s conversation', async () => {
    const { service } = setup([say('hi')]);
    const reply = await service.chat({ message: 'hi' }, USER);
    await expect(service.getConversation(reply.conversationId, { ...USER, userId: 'someone-else' })).rejects.toThrow('someone else');
  });

  it('only opens in-app pages', () => {
    expect(isAllowedPagePath('/tuesday')).toBe(true);
    expect(isAllowedPagePath('/project/5b1c7f7e-0f64-4a53-9a8e-1b2c3d4e5f60')).toBe(true);
    expect(isAllowedPagePath('https://evil.test')).toBe(false);
    expect(isAllowedPagePath('//evil.test')).toBe(false);
    expect(isAllowedPagePath('/share/abc')).toBe(false);
  });

  it('treats every data-changing tool as needing confirmation', () => {
    expect([...WRITE_TOOLS].sort()).toEqual(['add_task_comment', 'assign_task', 'attach_file', 'create_task', 'move_task', 'set_task_due_date']);
  });
});
