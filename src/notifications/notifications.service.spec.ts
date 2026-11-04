import { NotificationsService } from './notifications.service';
import { NotificationType } from './entities/notification.entity';

const flush = () => new Promise((resolve) => setImmediate(resolve));

const setup = (recipient: any = { email: 'pat@test.example', name: 'Pat', emailNotificationsEnabled: true }) => {
  const notifications = {
    create: jest.fn((data: any) => data),
    save: jest.fn(async (data: any) => ({ id: 'n1', isRead: false, createdAt: new Date(), ...data })),
  };
  const users = { findOne: jest.fn(async () => recipient), find: jest.fn(async () => [] as any[]) };
  const config = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'FRONTEND_URL' ? 'https://telos.example' : key === 'APP_NAME' ? 'Katalyst PM' : fallback,
    ),
  };
  const gateway = { emitNewNotification: jest.fn() };
  const email = { sendNotification: jest.fn(async () => undefined as void) };
  const service = new NotificationsService(notifications as any, users as any, config as any, gateway as any, email as any);
  return { service, users, gateway, email };
};

const notice = { type: NotificationType.TASK_ASSIGNED, title: 'New task', message: 'Do the thing', userId: 'u1' };

describe('notification emails', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it('sends the title, message and name to the recipient', async () => {
    const { service, email } = setup();
    await service.create({ ...notice, projectId: 'p1', taskId: 't1' });
    await flush();
    expect(email.sendNotification).toHaveBeenCalledWith({
      to: 'pat@test.example',
      userName: 'Pat',
      title: 'New task',
      message: 'Do the thing',
      viewLink: 'https://telos.example/project/p1?task=t1&tab=details',
      appName: 'Katalyst PM',
    });
  });

  it.each([
    ['an explicit link with no leading slash', { link: 'hub/tickets/1' }, 'https://telos.example/hub/tickets/1'],
    ['a project with no task', { projectId: 'p1' }, 'https://telos.example/project/p1'],
    ['nothing to link to', {}, 'https://telos.example'],
  ])('links to the right page for %s', async (_name, extra, viewLink) => {
    const { service, email } = setup();
    await service.create({ ...notice, ...extra });
    await flush();
    expect((email.sendNotification.mock.calls as any[])[0][0].viewLink).toBe(viewLink);
  });

  it('does not email someone who turned email notifications off, but still notifies in app', async () => {
    const { service, email, gateway } = setup({ email: 'pat@test.example', emailNotificationsEnabled: false });
    await service.create(notice);
    await flush();
    expect(email.sendNotification).not.toHaveBeenCalled();
    expect(gateway.emitNewNotification).toHaveBeenCalledTimes(1);
  });

  it('emails someone whose preference was never set', async () => {
    const { service, email } = setup({ email: 'pat@test.example', emailNotificationsEnabled: null });
    await service.create(notice);
    await flush();
    expect(email.sendNotification).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no address', { email: null }],
    ['no user', null],
  ])('does not email a recipient with %s', async (_name, recipient) => {
    const { service, email } = setup(recipient);
    await service.create(notice);
    await flush();
    expect(email.sendNotification).not.toHaveBeenCalled();
  });

  it('leaves the person who acted out of the Head PM copies', async () => {
    const { service, users, email } = setup();
    users.find.mockResolvedValue([{ id: 'actor' }, { id: 'other' }]);
    await service.notifyHeadPMsAlso({ type: notice.type, title: notice.title, message: notice.message }, 'actor');
    await flush();
    expect(users.findOne.mock.calls).toEqual([[expect.objectContaining({ where: { id: 'other' } })]]);
    expect(email.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('still saves and pushes the notification when the email fails', async () => {
    const { service, email, gateway } = setup();
    email.sendNotification.mockRejectedValue(new Error('Resend returned 500: down'));
    const saved = await service.create(notice);
    await flush();
    expect(saved.id).toBe('n1');
    expect(gateway.emitNewNotification).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it('still saves and pushes the notification when looking up the recipient fails', async () => {
    const { service, users, gateway } = setup();
    users.findOne.mockRejectedValue(new Error('db down'));
    const saved = await service.create(notice);
    await flush();
    expect(saved.id).toBe('n1');
    expect(gateway.emitNewNotification).toHaveBeenCalledTimes(1);
  });
});
