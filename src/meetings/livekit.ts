/**
 * LiveKit access tokens and the small part of its server API we use.
 * A LiveKit token is an ordinary HS256 JWT, so @nestjs/jwt signs it and no SDK is needed
 * (https://docs.livekit.io/home/get-started/authentication/).
 */
import { JwtService } from '@nestjs/jwt';

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/** A call keeps working after this; it only limits how long a token can be used to connect or reconnect. */
export const TOKEN_TTL_SECONDS = 6 * 60 * 60;

const jwt = new JwtService({});

export interface RoomTokenInput {
  room: string;
  identity: string;
  name: string;
  isHost: boolean;
}

export function createRoomToken(config: LiveKitConfig, input: RoomTokenInput): string {
  return jwt.sign(
    {
      name: input.name,
      metadata: JSON.stringify({ isHost: input.isHost }),
      video: {
        room: input.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: input.isHost,
      },
    },
    {
      secret: config.apiSecret,
      algorithm: 'HS256',
      issuer: config.apiKey,
      subject: input.identity,
      expiresIn: TOKEN_TTL_SECONDS,
      notBefore: 0,
    },
  );
}

/** Turns the wss:// address the browser uses into the https:// address of the server API. */
export function apiBaseUrl(url: string): string {
  return url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
}

/**
 * Closes a room, which disconnects everyone in it.
 * LiveKit answers 404 if nobody ever joined or the room already closed, which is a success here.
 */
export async function deleteRoom(config: LiveKitConfig, room: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const token = jwt.sign(
    { video: { room, roomCreate: true } },
    { secret: config.apiSecret, algorithm: 'HS256', issuer: config.apiKey, subject: 'katalyst-backend', expiresIn: 60 },
  );
  const res = await fetchFn(`${apiBaseUrl(config.url)}/twirp/livekit.RoomService/DeleteRoom`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`LiveKit answered ${res.status}`);
}
