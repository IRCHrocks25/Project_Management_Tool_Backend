/**
 * Live co-editing. Each open Doc, Grid or Slides file is a room holding a Yjs document in memory: edits from one
 * person merge into it and go out to everyone else, and it's written to Iceberg after a pause. This keeps rooms in
 * one process, so the backend must run as a single instance until rooms are shared through something like Redis.
 */
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { HubUsersService } from '../products/hub-users.service';
import { DriveClientsService } from './drive-clients.service';
import { DriveAccess, canEdit } from './drively.logic';
import { DrivelyService } from './drively.service';

/** Edits wait for a pause, because every write archives the previous copy in Iceberg. */
const SAVE_PAUSE_MS = 8_000;
const SAVE_AT_MOST_EVERY_MS = 30_000;
const RETRY_MS = 15_000;
const MAX_AWARENESS_BYTES = 64 * 1024;

type Level = DriveAccess;

interface Member {
  socket: DriveSocket;
  level: Level;
  clientId: number | null;
}

interface Room {
  id: string;
  doc: Y.Doc;
  members: Map<string, Member>;
  /** The socket asked to fill a brand-new file from its plain JSON. */
  seeder: string | null;
  needsSeed: boolean;
  seq: number;
  savedSeq: number;
  lastEditor: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  firstUnsavedAt: number | null;
  saving: Promise<void> | null;
}

interface DriveSocket extends Socket {
  userId?: string;
  role?: string | null;
  /** Set instead of userId for someone outside the company. They only ever watch. */
  portalClient?: { clientId: string; tokenVersion: number };
}

const asBytes = (data: unknown): Uint8Array | null => {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return null;
};

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/drively', maxHttpBufferSize: 12 * 1024 * 1024 })
export class DrivelyGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DrivelyGateway.name);
  private readonly rooms = new Map<string, Room>();
  private readonly opening = new Map<string, Promise<Room>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly drive: DrivelyService,
    private readonly users: HubUsersService,
    private readonly clients: DriveClientsService,
  ) {}

  onModuleInit() {
    this.drive.flushLive = (id) => this.flush(id);
    this.drive.onAccessChanged = () => void this.recheckAccess();
  }

  async onModuleDestroy() {
    await Promise.all([...this.rooms.keys()].map((id) => this.flush(id)));
  }

  // Synchronous, so a message arriving straight after connecting already has its user.
  handleConnection(client: DriveSocket) {
    try {
      const token = client.handshake.auth?.token;
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET', 'your-secret-key-change-in-production'),
      });
      client.userId = payload.sub;
    } catch {
      const portalClient = this.clients.verifyToken(client.handshake.auth?.token);
      if (portalClient) client.portalClient = portalClient;
      else client.disconnect();
    }
  }

  /** What this socket may do with a file right now. Looked up fresh, since access and roles change while a token lives. */
  private async accessFor(client: DriveSocket, itemId: string): Promise<Level | null> {
    if (client.portalClient) {
      const { clientId, tokenVersion } = client.portalClient;
      if (!(await this.clients.activeSession(clientId, tokenVersion))) return null;
      return this.drive.clientLiveAccess(itemId, clientId);
    }
    return this.drive.liveAccess(itemId, { userId: client.userId as string, role: client.role });
  }

  handleDisconnect(client: DriveSocket) {
    for (const room of this.rooms.values()) this.leave(room, client.id);
  }

  /* ---------------------------- joining ---------------------------- */

  private openRoom(id: string): Promise<Room> {
    const open = this.rooms.get(id);
    if (open) return Promise.resolve(open);
    const pending = this.opening.get(id);
    if (pending) return pending;
    const job = this.drive
      .loadLive(id)
      .then((stored) => {
        const doc = new Y.Doc({ gc: true });
        if (stored.yjs) Y.applyUpdate(doc, stored.yjs);
        const room: Room = {
          id,
          doc,
          members: new Map(),
          seeder: null,
          needsSeed: !stored.yjs,
          seq: 0,
          savedSeq: 0,
          lastEditor: null,
          timer: null,
          firstUnsavedAt: null,
          saving: null,
        };
        this.rooms.set(id, room);
        return room;
      })
      .finally(() => this.opening.delete(id));
    this.opening.set(id, job);
    return job;
  }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: DriveSocket, @MessageBody() body: { itemId: string; stateVector?: unknown; clientId?: number }) {
    if ((!client.userId && !client.portalClient) || typeof body?.itemId !== 'string') return { ok: false };
    try {
      // The role can change while a token lives, so it comes from the database.
      if (client.userId) client.role = (await this.users.findOne(client.userId))?.role ?? null;
      const level = await this.accessFor(client, body.itemId);
      if (!level) return { ok: false, error: 'not_found' };
      const room = await this.openRoom(body.itemId);
      room.members.set(client.id, { socket: client, level, clientId: typeof body.clientId === 'number' ? body.clientId : null });
      client.join(body.itemId);
      const vector = asBytes(body.stateVector);
      const update = Y.encodeStateAsUpdate(room.doc, vector ?? undefined);
      let seed = false;
      if (room.needsSeed && !room.seeder && canEdit(level)) {
        room.seeder = client.id;
        seed = true;
      }
      return { ok: true, level, update, stateVector: Y.encodeStateVector(room.doc), seed, seq: room.seq, savedSeq: room.savedSeq };
    } catch (error: any) {
      this.logger.error(`Could not open ${body.itemId}: ${error?.message || error}`);
      return { ok: false, error: 'unavailable' };
    }
  }

  @SubscribeMessage('leave')
  leaveRoom(@ConnectedSocket() client: DriveSocket, @MessageBody() body: { itemId: string }) {
    const room = this.rooms.get(body?.itemId);
    if (room) {
      this.leave(room, client.id);
      client.leave(room.id);
    }
    return { ok: true };
  }

  private leave(room: Room, socketId: string) {
    const member = room.members.get(socketId);
    if (!member) return;
    room.members.delete(socketId);
    if (member.clientId !== null) this.server.to(room.id).emit('peer-left', { itemId: room.id, clientId: member.clientId });
    if (room.seeder === socketId) {
      room.seeder = null;
      const next = [...room.members.values()].find((m) => canEdit(m.level));
      if (room.needsSeed && next) {
        room.seeder = next.socket.id;
        next.socket.emit('seed', { itemId: room.id });
      }
    }
    if (room.members.size === 0) void this.flush(room.id).then(() => this.closeIfEmpty(room));
  }

  private closeIfEmpty(room: Room) {
    if (room.members.size === 0 && room.savedSeq >= room.seq && this.rooms.get(room.id) === room) {
      if (room.timer) clearTimeout(room.timer);
      room.doc.destroy();
      this.rooms.delete(room.id);
    }
  }

  /* ---------------------------- editing ---------------------------- */

  @SubscribeMessage('update')
  update(@ConnectedSocket() client: DriveSocket, @MessageBody() body: { itemId: string; update: unknown }) {
    const room = this.rooms.get(body?.itemId);
    const member = room?.members.get(client.id);
    const bytes = asBytes(body?.update);
    if (!room || !member || !bytes) return { ok: false };
    if (!canEdit(member.level)) return { ok: false, error: 'view_only' };
    try {
      Y.applyUpdate(room.doc, bytes, client.id);
    } catch {
      return { ok: false, error: 'bad_update' };
    }
    room.seq += 1;
    room.lastEditor = client.userId ?? null;
    if (room.seeder === client.id) {
      room.seeder = null;
      room.needsSeed = false;
    }
    client.to(room.id).emit('update', { itemId: room.id, update: bytes });
    this.scheduleSave(room);
    return { ok: true, seq: room.seq };
  }

  @SubscribeMessage('awareness')
  awareness(@ConnectedSocket() client: DriveSocket, @MessageBody() body: { itemId: string; update: unknown }) {
    const room = this.rooms.get(body?.itemId);
    const bytes = asBytes(body?.update);
    // Clients see who's in the file but don't announce themselves to it.
    if (client.portalClient || !room?.members.has(client.id) || !bytes || bytes.length > MAX_AWARENESS_BYTES) return;
    client.to(room.id).emit('awareness', { itemId: room.id, update: bytes });
  }

  /* ---------------------------- saving ---------------------------- */

  private scheduleSave(room: Room, delay = SAVE_PAUSE_MS) {
    const now = Date.now();
    room.firstUnsavedAt = room.firstUnsavedAt ?? now;
    const latest = room.firstUnsavedAt + SAVE_AT_MOST_EVERY_MS - now;
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => void this.flush(room.id), Math.max(0, Math.min(delay, latest)));
  }

  /** Writes unsaved edits to Iceberg. Resolves when they're stored, or after a failed try that will be retried. */
  async flush(id: string): Promise<void> {
    const room = this.rooms.get(id);
    if (!room) return;
    if (room.saving) await room.saving;
    if (room.savedSeq >= room.seq) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const seq = room.seq;
    room.saving = this.drive
      .persistLive(id, Y.encodeStateAsUpdate(room.doc), room.lastEditor)
      .then(() => {
        room.savedSeq = seq;
        room.firstUnsavedAt = room.seq > seq ? Date.now() : null;
        this.server.to(id).emit('saved', { itemId: id, seq });
        if (room.seq > seq) this.scheduleSave(room);
      })
      .catch((error: any) => {
        this.logger.error(`Could not save ${id} to Iceberg: ${error?.message || error}`);
        this.server.to(id).emit('save-failed', { itemId: id });
        room.timer = setTimeout(() => void this.flush(id).then(() => this.closeIfEmpty(room)), RETRY_MS);
      })
      .finally(() => {
        room.saving = null;
      });
    await room.saving;
  }

  /** After sharing or trash changes: anyone who lost access is removed, and view or edit is brought up to date. */
  private async recheckAccess() {
    for (const room of this.rooms.values()) {
      for (const member of [...room.members.values()]) {
        const { socket } = member;
        try {
          const level = await this.accessFor(socket, room.id);
          if (!level) {
            socket.emit('removed', { itemId: room.id });
            socket.leave(room.id);
            this.leave(room, socket.id);
          } else if (level !== member.level) {
            member.level = level;
            socket.emit('access', { itemId: room.id, level });
          }
        } catch (error: any) {
          this.logger.warn(`Could not re-check access to ${room.id}: ${error?.message || error}`);
        }
      }
    }
  }
}
