import { MeetingNotesService } from './meeting-notes.service';

const repo = (overrides: Record<string, any> = {}) => ({
  find: jest.fn(async () => []),
  findOne: jest.fn(async () => null),
  count: jest.fn(async () => 0),
  update: jest.fn(async () => ({ affected: 1 })),
  delete: jest.fn(async () => ({ affected: 1 })),
  insert: jest.fn(async () => ({})),
  ...overrides,
});

const segment = { n: 0, ownerId: 'u1', contentType: 'audio/webm', startedAt: '2026-11-06T10:00:00Z' };
const deepgramAnswer = { results: { channels: [{ detected_language: 'en' }], utterances: [{ start: 0, end: 2, speaker: 0, transcript: 'Send the form.' }] } };
const claudeAnswer = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ overview: 'Agreed.', topics: [], actionItems: [{ text: 'Send the form', owner: 'Julia' }] }) }],
};

function setup(noteOverrides: Record<string, any> = {}, env: Record<string, string> = { DEEPGRAM_API_KEY: 'dg', ANTHROPIC_API_KEY: 'an' }) {
  const note = { id: 'n1', meetingId: 'm1', status: 'processing', attempts: 1, segments: [segment], speakerSpans: [], transcript: null, overview: null, ...noteOverrides };
  const tx = { delete: jest.fn(async () => ({})), insert: jest.fn(async () => ({})), update: jest.fn(async () => ({})) };
  const notes = repo({ findOne: jest.fn(async () => note), manager: { transaction: (fn: any) => fn(tx) } });
  const recipients = repo({ find: jest.fn(async () => [{ noteId: 'n1', userId: 'u1' }]) });
  const chunks = repo({ find: jest.fn(async () => [{ data: Buffer.from('audio') }]) });
  const items = repo();
  const meetings = repo({ findOne: jest.fn(async () => ({ id: 'm1', title: 'Strategy call' })) });
  const users = repo({ find: jest.fn(async () => [{ id: 'u1', name: 'Julia', email: 'julia@test.example' }]) });
  const email = { sendNotification: jest.fn(async () => undefined) };
  const service = new MeetingNotesService(
    notes as any,
    recipients as any,
    chunks as any,
    items as any,
    repo() as any,
    meetings as any,
    repo() as any,
    repo() as any,
    repo() as any,
    users as any,
    {} as any,
    { load: jest.fn(async () => new Map()) } as any,
    {} as any,
    email as any,
    { get: (key: string) => env[key] } as any,
  );
  const finalMessage = jest.fn(async () => claudeAnswer);
  service.clientFactory = () => ({ beta: { messages: { stream: jest.fn(() => ({ finalMessage })) } } });
  return { service, note, notes, recipients, chunks, tx, email, finalMessage };
}

describe('MeetingNotesService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify(deepgramAnswer), { status: 200 }));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('transcribes, deletes the audio, saves the summary and emails the recipient', async () => {
    const { service, notes, chunks, tx, email } = setup();
    await service.process('n1');
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/listen?');
    expect((notes.update as jest.Mock).mock.calls[0][1].transcript[0].text).toBe('Send the form.');
    expect(chunks.delete).toHaveBeenCalledWith({ noteId: 'n1' });
    expect((tx.update as jest.Mock).mock.calls[0][2].status).toBe('ready');
    expect((tx.insert as jest.Mock).mock.calls[0][1][0].text).toBe('Send the form');
    expect((email.sendNotification as jest.Mock).mock.calls[0][0].viewLink).toMatch(/\/meetings\/notes\/n1$/);
  });

  it('skips Claude and the email when nobody spoke', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ results: { channels: [{}], utterances: [] } }), { status: 200 }));
    const { service, notes, email, finalMessage } = setup();
    await service.process('n1');
    expect((notes.update as jest.Mock).mock.calls[0][1].status).toBe('empty');
    expect(finalMessage).not.toHaveBeenCalled();
    expect(email.sendNotification).not.toHaveBeenCalled();
  });

  it('keeps the audio and tries again later when transcription fails', async () => {
    fetchMock.mockImplementation(async () => new Response('nope', { status: 500 }));
    const { service, notes, chunks } = setup();
    await service.process('n1');
    expect((notes.update as jest.Mock).mock.calls[0][1].status).toBe('closing');
    expect(chunks.delete).not.toHaveBeenCalled();
  });

  it("doesn't transcribe again when only the summary failed", async () => {
    const { service, finalMessage } = setup({ transcript: [{ start: 0, end: 2, speaker: 'Julia', text: 'Hi' }] });
    finalMessage.mockRejectedValueOnce(new Error('busy'));
    await service.process('n1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives up after the last attempt and says so by email', async () => {
    fetchMock.mockImplementation(async () => new Response('nope', { status: 500 }));
    const { service, notes, email } = setup({ attempts: 3 });
    await service.process('n1');
    expect((notes.update as jest.Mock).mock.calls[0][1].status).toBe('failed');
    expect((email.sendNotification as jest.Mock).mock.calls[0][0].title).toContain("couldn't finish");
  });

  it("hides notes from anyone who isn't a recipient", async () => {
    const { service, recipients } = setup();
    (recipients.count as jest.Mock).mockResolvedValue(0);
    await expect(service.get('n1', { userId: 'other' })).rejects.toThrow('no longer exist');
    await expect(service.remove('n1', { userId: 'other' })).rejects.toThrow('no longer exist');
  });

  it('deletes the notes once the last person removes their copy', async () => {
    const { service, notes, recipients } = setup();
    (recipients.count as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await service.remove('n1', { userId: 'u1' });
    expect(notes.delete).toHaveBeenCalledWith('n1');
  });

  it('reports as off until both keys are there', async () => {
    const { service } = setup({}, { ANTHROPIC_API_KEY: 'an' });
    await expect(service.preferences({ userId: 'u1' })).resolves.toEqual({ autoNotes: false, available: false });
  });
});
