import { EmailService } from './email.service';

const reply = (status: number, body: any = { id: 're_1' }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const setup = (env: Record<string, string> = { RESEND_API_KEY: 'test-key' }) =>
  new EmailService({ get: (key: string) => env[key] } as any);

const email = { to: 'pat@test.example', title: 'New <task>', message: 'A & B', userName: 'Pat', viewLink: 'https://telos.example/p?a=1&b=2' };

describe('EmailService.sendNotification', () => {
  let fetchMock: jest.SpyInstance;
  const sentBody = (call = 0) => JSON.parse(fetchMock.mock.calls[call][1].body);

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => reply(200));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps the subject, message and link, and escapes them in the HTML', async () => {
    await setup().sendNotification(email);
    const body = sentBody();
    expect(body.to).toEqual(['pat@test.example']);
    expect(body.subject).toBe('New <task>');
    expect(body.text).toContain('A & B');
    expect(body.text).toContain('https://telos.example/p?a=1&b=2');
    expect(body.html).toContain('New &lt;task&gt;');
    expect(body.html).toContain('A &amp; B');
    expect(body.html).toContain('href="https://telos.example/p?a=1&amp;b=2"');
  });

  it('uses RESEND_FROM when set and the verified default otherwise', async () => {
    await setup({ RESEND_API_KEY: 'k', RESEND_FROM: 'Team <team@katek-ai.com>' }).sendNotification(email);
    await setup().sendNotification(email);
    expect(sentBody(0).from).toBe('Team <team@katek-ai.com>');
    expect(sentBody(1).from).toBe('Katalyst PM <noreply@katek-ai.com>');
  });

  it('rejects when the key is missing, without calling Resend', async () => {
    await expect(setup({}).sendNotification(email)).rejects.toThrow('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when Resend refuses the email', async () => {
    fetchMock.mockResolvedValue(reply(422, { message: 'bad from' }));
    await expect(setup().sendNotification(email)).rejects.toThrow('Resend returned 422');
  });

  it('rejects when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(setup().sendNotification(email)).rejects.toThrow('offline');
  });

  it('retries when rate limited, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, {}, { 'retry-after': '0' }));
    await setup().sendNotification(email);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three rate limited attempts', async () => {
    fetchMock.mockImplementation(async () => reply(429, {}, { 'retry-after': '0' }));
    await expect(setup().sendNotification(email)).rejects.toThrow('Resend returned 429');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends a burst one at a time, and one failure does not stop the next', async () => {
    let inFlight = 0;
    let most = 0;
    fetchMock.mockImplementation(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return fetchMock.mock.calls.length === 1 ? reply(500) : reply(200);
    });
    const service = setup();
    const results = await Promise.allSettled([service.sendNotification(email), service.sendNotification(email)]);
    expect(most).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled']);
  });

  it('skips seeded .local accounts without calling Resend', async () => {
    await setup().sendNotification({ ...email, to: 'head.pm@telos.local' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('EmailService sections', () => {
  afterEach(() => jest.restoreAllMocks());

  it('adds escaped sections and uses the given button text and footer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => reply(200));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await setup().sendNotification({
      ...email,
      sections: [{ heading: 'Action <items>', bullets: ['Send & confirm'] }],
      viewLabel: 'View in Telos',
      footer: 'Because you had notes on.',
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.html).toContain('Action &lt;items&gt;');
    expect(body.html).toContain('<li style="margin:0 0 6px">Send &amp; confirm</li>');
    expect(body.html).toContain('View in Telos</a>');
    expect(body.html).toContain('Because you had notes on.');
    expect(body.html).not.toContain('turn them off in Settings');
    expect(body.text).toContain('Action <items>\n- Send & confirm');
  });
});
