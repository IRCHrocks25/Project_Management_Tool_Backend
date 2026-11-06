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

type RoomServiceMethod = 'DeleteRoom' | 'RemoveParticipant' | 'GetParticipant' | 'MutePublishedTrack' | 'UpdateRoomMetadata';

/** Calls LiveKit's room API. Returns null on a 404, which means the room or person has already gone. */
async function roomService(
  config: LiveKitConfig,
  room: string,
  method: RoomServiceMethod,
  body: Record<string, unknown>,
  fetchFn: typeof fetch,
): Promise<any | null> {
  const video = method === 'DeleteRoom' ? { room, roomCreate: true } : { room, roomAdmin: true };
  const token = jwt.sign(
    { video },
    { secret: config.apiSecret, algorithm: 'HS256', issuer: config.apiKey, subject: 'katalyst-backend', expiresIn: 60 },
  );
  const res = await fetchFn(`${apiBaseUrl(config.url)}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, ...body }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LiveKit answered ${res.status}`);
  return res.json().catch(() => ({}));
}

/** Closes a room, which disconnects everyone in it. A room that never opened or already closed counts as a success. */
export async function deleteRoom(config: LiveKitConfig, room: string, fetchFn: typeof fetch = fetch): Promise<void> {
  await roomService(config, room, 'DeleteRoom', {}, fetchFn);
}

/** Disconnects one person. Someone who has already left counts as a success. */
export async function removeParticipant(
  config: LiveKitConfig,
  room: string,
  identity: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await roomService(config, room, 'RemoveParticipant', { identity }, fetchFn);
}

/** Mutes one person's microphone, leaving any audio from a screen share alone. They can unmute themselves. */
export async function muteParticipant(
  config: LiveKitConfig,
  room: string,
  identity: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const participant = await roomService(config, room, 'GetParticipant', { identity }, fetchFn);
  const microphones = (participant?.tracks || []).filter(
    (track: { source?: string; muted?: boolean }) => track.source === 'MICROPHONE' && !track.muted,
  );
  await Promise.all(
    microphones.map((track: { sid: string }) =>
      roomService(config, room, 'MutePublishedTrack', { identity, track_sid: track.sid, muted: true }, fetchFn),
    ),
  );
}

/** Room metadata reaches everyone in the call, including people who join later. */
export async function updateRoomMetadata(
  config: LiveKitConfig,
  room: string,
  metadata: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await roomService(config, room, 'UpdateRoomMetadata', { metadata }, fetchFn);
}
