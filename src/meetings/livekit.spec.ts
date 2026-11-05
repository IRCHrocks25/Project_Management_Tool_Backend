import { JwtService } from '@nestjs/jwt';
import { apiBaseUrl, createRoomToken, deleteRoom } from './livekit';

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
});
