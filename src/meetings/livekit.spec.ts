import { JwtService } from '@nestjs/jwt';
import { apiBaseUrl, createRoomToken, deleteRoom, muteParticipant, removeParticipant, updateRoomMetadata } from './livekit';

const config = { url: 'wss://demo.livekit.cloud', apiKey: 'key123', apiSecret: 'a-long-enough-test-secret-value' };
const jwt = new JwtService({});

describe('LiveKit helpers', () => {
  it('signs a token LiveKit can read, limited to one room', () => {
    const token = createRoomToken(config, { room: 'room-1', identity: 'user:1', name: 'Dana', isHost: false });
    const claims = jwt.verify(token, { secret: config.apiSecret, algorithms: ['HS256'] });
    expect(claims.iss).toBe('key123');
    expect(claims.sub).toBe('user:1');
    expect(claims.name).toBe('Dana');
    expect(claims.video).toEqual({
      room: 'room-1',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: false,
    });
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it('only makes the host a room admin', () => {
    const token = createRoomToken(config, { room: 'r', identity: 'user:1', name: 'H', isHost: true });
    expect(jwt.decode(token).video.roomAdmin).toBe(true);
  });

  it('converts socket addresses to the API address', () => {
    expect(apiBaseUrl('wss://demo.livekit.cloud/')).toBe('https://demo.livekit.cloud');
    expect(apiBaseUrl('ws://localhost:7880')).toBe('http://localhost:7880');
  });

  it('treats an already closed room as closed', async () => {
    const notFound = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(deleteRoom(config, 'room-1', notFound as any)).resolves.toBeUndefined();
    expect(notFound.mock.calls[0][0]).toBe('https://demo.livekit.cloud/twirp/livekit.RoomService/DeleteRoom');
  });

  it('reports a real failure', async () => {
    const failing = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(deleteRoom(config, 'room-1', failing as any)).rejects.toThrow('500');
  });

  const reply = (status: number, body: unknown = {}) => ({ ok: status < 400, status, json: async () => body }) as Response;

  it('removes one person from one room, with a token limited to that room', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply(200));
    await removeParticipant(config, 'room-1', 'guest:9', fetchFn as any);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://demo.livekit.cloud/twirp/livekit.RoomService/RemoveParticipant');
    expect(JSON.parse(init.body)).toEqual({ room: 'room-1', identity: 'guest:9' });
    const claims = jwt.verify(init.headers.Authorization.replace('Bearer ', ''), { secret: config.apiSecret, algorithms: ['HS256'] });
    expect(claims.video).toEqual({ room: 'room-1', roomAdmin: true });
  });

  it('treats removing someone who already left as done', async () => {
    await expect(removeParticipant(config, 'r', 'user:1', jest.fn().mockResolvedValue(reply(404)) as any)).resolves.toBeUndefined();
  });

  it('reports other LiveKit failures', async () => {
    await expect(removeParticipant(config, 'r', 'user:1', jest.fn().mockResolvedValue(reply(500)) as any)).rejects.toThrow('500');
  });

  it('mutes only a live microphone, not screen share audio', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        reply(200, {
          tracks: [
            { sid: 'TR_mic', source: 'MICROPHONE', muted: false },
            { sid: 'TR_share', source: 'SCREEN_SHARE_AUDIO', muted: false },
            { sid: 'TR_cam', source: 'CAMERA', muted: false },
          ],
        }),
      )
      .mockResolvedValue(reply(200));
    await muteParticipant(config, 'r', 'user:1', fetchFn as any);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body)).toEqual({ room: 'r', identity: 'user:1', track_sid: 'TR_mic', muted: true });
  });

  it('does nothing when muting someone who already left', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply(404));
    await muteParticipant(config, 'r', 'user:1', fetchFn as any);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('tells the room when it is being recorded', async () => {
    const fetchFn = jest.fn().mockResolvedValue(reply(200));
    await updateRoomMetadata(config, 'r', '{"recording":true}', fetchFn as any);
    expect(fetchFn.mock.calls[0][0]).toContain('/UpdateRoomMetadata');
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ room: 'r', metadata: '{"recording":true}' });
  });
});
