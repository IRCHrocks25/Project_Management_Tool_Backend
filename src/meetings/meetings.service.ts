import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { In, IsNull, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { HubUsersService, SafeUser } from '../products/hub-users.service';
import { Project } from '../projects/entities/project.entity';
import { CreateMeetingDto, GuestLinkDto, UpdateMeetingDto } from './dto/meetings.dto';
import { MeetingGuest } from './entities/meeting-guest.entity';
import { MeetingInvitee } from './entities/meeting-invitee.entity';
import { Meeting } from './entities/meeting.entity';
import { LiveKitConfig, createRoomToken, deleteRoom, muteParticipant, removeParticipant } from './livekit';
import { STALE_AFTER_MS, canJoin, cleanInvitees, isClosed, isGuestPresent } from './meeting-rules';

const NOT_SET_UP = "Video calls aren't set up yet. Add the LiveKit keys to the server.";
const LINK_OFF = "This meeting link isn't working. Ask the person who sent it for a new one.";
const DEFAULT_MINUTES = 30;
const LIST_LIMIT = 200;

export interface MeetingActor {
  userId: string;
}

const randomCode = (bytes: number) => randomBytes(bytes).toString('base64url');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingInvitee) private readonly invitees: Repository<MeetingInvitee>,
    @InjectRepository(MeetingGuest) private readonly guests: Repository<MeetingGuest>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly hubUsers: HubUsersService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /* ---------------------------- Teammates ---------------------------- */

  async list(view: string, actor: MeetingActor) {
    const past = view === 'past';
    // A meeting is past once closed, or once it has gone stale without anyone ending it.
    const isPastSql = `(m.status IN ('ended', 'cancelled') OR m."startsAt" + make_interval(mins => m."durationMinutes", secs => :staleSeconds) < now())`;
    const rows = await this.meetings
      .createQueryBuilder('m')
      .leftJoin(MeetingInvitee, 'i', 'i."meetingId" = m.id AND i."userId" = :me', { me: actor.userId })
      .where('(m."hostId" = :me OR i."userId" IS NOT NULL)', { me: actor.userId })
      .andWhere(past ? isPastSql : `NOT ${isPastSql}`, { staleSeconds: STALE_AFTER_MS / 1000 })
      .orderBy('m.startsAt', past ? 'DESC' : 'ASC')
      .take(LIST_LIMIT)
      .getMany();
    return { meetings: await this.present(rows, actor), videoReady: !!this.liveKit() };
  }

  async get(id: string, actor: MeetingActor) {
    const meeting = await this.visibleMeeting(id, actor);
    const [shaped] = await this.present([meeting], actor);
    return { ...shaped, videoReady: !!this.liveKit() };
  }

  async create(dto: CreateMeetingDto, actor: MeetingActor) {
    await this.assertProject(dto.projectId);
    const now = new Date();
    const startsNow = !dto.startsAt;
    const startsAt = startsNow ? now : new Date(dto.startsAt);
    if (!startsNow && startsAt.getTime() < now.getTime() - 60_000) {
      throw new BadRequestException('Choose a start time in the future.');
    }
    const meeting = await this.meetings.save(
      this.meetings.create({
        title: dto.title.trim(),
        notes: dto.notes?.trim() || null,
        startsAt,
        durationMinutes: dto.durationMinutes ?? DEFAULT_MINUTES,
        hostId: actor.userId,
        projectId: dto.projectId ?? null,
        roomName: `meeting-${randomCode(16)}`,
        guestCode: randomCode(18),
      }),
    );
    const added = await this.setInvitees(meeting, dto.inviteeIds);
    await this.notifyInvited(meeting, added, actor);
    const [shaped] = await this.present([meeting], actor);
    return shaped;
  }

  async update(id: string, dto: UpdateMeetingDto, actor: MeetingActor) {
    const meeting = await this.hostedMeeting(id, actor);
    if (isClosed(meeting.status)) throw new BadRequestException('This meeting has finished, so it can no longer be changed.');
    if (dto.projectId !== undefined) await this.assertProject(dto.projectId);
    if (dto.title !== undefined) meeting.title = dto.title.trim();
    if (dto.notes !== undefined) meeting.notes = dto.notes?.trim() || null;
    if (dto.startsAt !== undefined) meeting.startsAt = new Date(dto.startsAt);
    if (dto.durationMinutes !== undefined) meeting.durationMinutes = dto.durationMinutes;
    if (dto.projectId !== undefined) meeting.projectId = dto.projectId;
    await this.meetings.save(meeting);
    if (dto.inviteeIds !== undefined) {
      const added = await this.setInvitees(meeting, dto.inviteeIds);
      await this.notifyInvited(meeting, added, actor);
    }
    const [shaped] = await this.present([meeting], actor);
    return shaped;
  }

  /** Hands the browser what it needs to connect. The first person in marks the meeting live. */
  async join(id: string, actor: MeetingActor) {
    const meeting = await this.visibleMeeting(id, actor);
    if (!canJoin(meeting)) throw new GoneException('This meeting has finished.');
    const config = this.requireLiveKit();
    const me = await this.hubUsers.findOne(actor.userId);
    const isHost = meeting.hostId === actor.userId;

    await this.markLive(meeting);
    if (!isHost) {
      await this.invitees.update({ meetingId: id, userId: actor.userId, joinedAt: IsNull() }, { joinedAt: new Date() });
    }
    return {
      url: config.url,
      token: createRoomToken(config, {
        room: meeting.roomName,
        identity: `user:${actor.userId}`,
        name: me?.name || 'Teammate',
        isHost,
      }),
      isHost,
    };
  }

  /** Host only: mutes someone's microphone. They can turn it back on. */
  async muteParticipant(id: string, identity: string, actor: MeetingActor) {
    const { meeting, config } = await this.liveCall(id, actor);
    await this.callLiveKit(() => muteParticipant(config, meeting.roomName, identity), "Couldn't mute them. Try again.");
    return { muted: true };
  }

  /**
   * Host only: takes someone out of the call. A guest is also marked denied, so opening the link
   * again puts them back in the waiting room as a new request. A teammate can rejoin from the meeting page.
   */
  async removeParticipant(id: string, identity: string, actor: MeetingActor) {
    if (identity === `user:${actor.userId}`) throw new BadRequestException("You can't remove yourself. Use Leave instead.");
    const { meeting, config } = await this.liveCall(id, actor);
    if (identity.startsWith('guest:')) {
      await this.guests.update({ id: identity.slice('guest:'.length), meetingId: id }, { status: 'denied' });
    }
    await this.callLiveKit(() => removeParticipant(config, meeting.roomName, identity), "Couldn't remove them. Try again.");
    return { removed: true };
  }

  /** Host only: disconnects everyone and closes the meeting. */
  async end(id: string, actor: MeetingActor) {
    const meeting = await this.hostedMeeting(id, actor);
    if (isClosed(meeting.status)) return { status: meeting.status };
    await this.closeRoom(meeting);
    meeting.status = 'ended';
    meeting.endedAt = new Date();
    await this.meetings.save(meeting);
    return { status: meeting.status };
  }

  async cancel(id: string, actor: MeetingActor) {
    const meeting = await this.hostedMeeting(id, actor);
    if (isClosed(meeting.status)) return { status: meeting.status };
    await this.closeRoom(meeting);
    meeting.status = 'cancelled';
    await this.meetings.save(meeting);
    return { status: meeting.status };
  }

  async setGuestLink(id: string, dto: GuestLinkDto, actor: MeetingActor) {
    const meeting = await this.hostedMeeting(id, actor);
    if (dto.enabled !== undefined) meeting.guestLinkEnabled = dto.enabled;
    if (dto.regenerate) meeting.guestCode = randomCode(18);
    await this.meetings.save(meeting);
    // Anyone still waiting came through the link that was just closed.
    if (dto.enabled === false || dto.regenerate) {
      await this.guests.update({ meetingId: id, status: 'waiting' }, { status: 'denied' });
    }
    return { guestCode: meeting.guestCode, guestLinkEnabled: meeting.guestLinkEnabled };
  }

  /** Host only: guests in the waiting room right now. */
  async waitingGuests(id: string, actor: MeetingActor) {
    await this.hostedMeeting(id, actor);
    const rows = await this.guests.find({ where: { meetingId: id, status: 'waiting' }, order: { createdAt: 'ASC' } });
    return rows.filter((g) => isGuestPresent(g.lastSeenAt)).map((g) => ({ id: g.id, name: g.name, createdAt: g.createdAt }));
  }

  async decideGuest(id: string, guestId: string, decision: 'admit' | 'deny', actor: MeetingActor) {
    await this.hostedMeeting(id, actor);
    const guest = await this.guests.findOne({ where: { id: guestId, meetingId: id } });
    if (!guest) throw new NotFoundException('This guest has left.');
    guest.status = decision === 'admit' ? 'admitted' : 'denied';
    guest.admittedAt = decision === 'admit' ? new Date() : null;
    await this.guests.save(guest);
    return { id: guest.id, status: guest.status };
  }

  /* ------------------------------ Guests ----------------------------- */

  async publicInfo(code: string) {
    const meeting = await this.meetingByCode(code);
    const host = await this.hubUsers.findOne(meeting.hostId);
    return {
      title: meeting.title,
      hostName: host?.name ?? null,
      startsAt: meeting.startsAt,
      status: meeting.status,
      videoReady: !!this.liveKit(),
    };
  }

  /** Puts a guest in the waiting room. The secret proves later status checks are theirs. */
  async askToJoin(code: string, name: string) {
    const meeting = await this.meetingByCode(code);
    if (!canJoin(meeting)) throw new GoneException('This meeting has finished.');
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Enter your name.');
    const secret = randomCode(32);
    const guest = await this.guests.save(
      this.guests.create({ meetingId: meeting.id, name: clean, secretHash: sha256(secret), lastSeenAt: new Date() }),
    );
    return { guestId: guest.id, secret };
  }

  /** The guest's browser calls this every few seconds. Once admitted, the answer includes the token. */
  async guestStatus(code: string, guestId: string, secret: string) {
    const meeting = await this.meetingByCode(code);
    const guest = await this.guests
      .createQueryBuilder('g')
      .addSelect('g.secretHash')
      .where('g.id = :guestId AND g."meetingId" = :meetingId', { guestId, meetingId: meeting.id })
      .getOne();
    const given = Buffer.from(sha256(secret));
    if (!guest || !timingSafeEqual(given, Buffer.from(guest.secretHash))) throw new NotFoundException(LINK_OFF);

    await this.guests.update({ id: guest.id }, { lastSeenAt: new Date() });
    if (!canJoin(meeting)) return { status: 'ended' as const };
    if (guest.status !== 'admitted') return { status: guest.status };

    const config = this.requireLiveKit();
    await this.markLive(meeting);
    return {
      status: guest.status,
      url: config.url,
      token: createRoomToken(config, {
        room: meeting.roomName,
        identity: `guest:${guest.id}`,
        name: `${guest.name} (guest)`,
        isHost: false,
      }),
    };
  }

  /* ----------------------------- Helpers ----------------------------- */

  private liveKit(): LiveKitConfig | null {
    const url = this.config.get<string>('LIVEKIT_URL');
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
  }

  private requireLiveKit(): LiveKitConfig {
    const config = this.liveKit();
    if (!config) throw new ServiceUnavailableException(NOT_SET_UP);
    return config;
  }

  private async liveCall(id: string, actor: MeetingActor) {
    const meeting = await this.hostedMeeting(id, actor);
    if (isClosed(meeting.status)) throw new GoneException('This meeting has finished.');
    return { meeting, config: this.requireLiveKit() };
  }

  private async callLiveKit(action: () => Promise<void>, failure: string) {
    try {
      await action();
    } catch (error) {
      this.logger.warn(`LiveKit call failed: ${error?.message || error}`);
      throw new ServiceUnavailableException(failure);
    }
  }

  private async closeRoom(meeting: Meeting) {
    const config = this.liveKit();
    if (!config || !meeting.startedAt) return;
    try {
      await deleteRoom(config, meeting.roomName);
    } catch (error) {
      // The meeting still closes, so nobody new can get in. People already on the call stay until they leave.
      this.logger.warn(`Could not close room for meeting ${meeting.id}: ${error?.message || error}`);
    }
  }

  private async markLive(meeting: Meeting) {
    if (meeting.status === 'live') return;
    meeting.status = 'live';
    meeting.startedAt = meeting.startedAt ?? new Date();
    await this.meetings.save(meeting);
  }

  private async meetingByCode(code: string) {
    const meeting = await this.meetings.findOne({ where: { guestCode: code } });
    if (!meeting || !meeting.guestLinkEnabled) throw new NotFoundException(LINK_OFF);
    return meeting;
  }

  /** 404 rather than 403, so people outside a meeting can't tell it exists. */
  private async visibleMeeting(id: string, actor: MeetingActor) {
    const meeting = await this.meetings.findOne({ where: { id } });
    if (!meeting) throw new NotFoundException("This meeting doesn't exist.");
    if (meeting.hostId === actor.userId) return meeting;
    const invited = await this.invitees.findOne({ where: { meetingId: id, userId: actor.userId } });
    if (!invited) throw new NotFoundException("This meeting doesn't exist.");
    return meeting;
  }

  private async hostedMeeting(id: string, actor: MeetingActor) {
    const meeting = await this.visibleMeeting(id, actor);
    if (meeting.hostId !== actor.userId) throw new ForbiddenException('Only the host can do that.');
    return meeting;
  }

  private async assertProject(projectId: string | null | undefined) {
    if (!projectId) return;
    if (!(await this.projects.exist({ where: { id: projectId } }))) {
      throw new BadRequestException('That project no longer exists.');
    }
  }

  /** Replaces the invite list, keeping attendance for people who stay. Returns who is new. */
  private async setInvitees(meeting: Meeting, ids: string[] | undefined): Promise<string[]> {
    if (ids === undefined) return [];
    const wanted = cleanInvitees(ids, meeting.hostId);
    const known = await this.hubUsers.load(wanted);
    const valid = wanted.filter((id) => known.has(id));
    const current = await this.invitees.find({ where: { meetingId: meeting.id } });
    const currentIds = new Set(current.map((i) => i.userId));
    const removed = current.filter((i) => !valid.includes(i.userId)).map((i) => i.userId);
    if (removed.length) await this.invitees.delete({ meetingId: meeting.id, userId: In(removed) });
    const added = valid.filter((id) => !currentIds.has(id));
    if (added.length) {
      await this.invitees.insert(added.map((userId) => ({ meetingId: meeting.id, userId, joinedAt: null })));
    }
    return added;
  }

  private async notifyInvited(meeting: Meeting, userIds: string[], actor: MeetingActor) {
    if (!userIds.length) return;
    const host = await this.hubUsers.findOne(actor.userId);
    await Promise.all(
      userIds.map((userId) =>
        this.notifications
          .create({
            type: NotificationType.MEETING_INVITE,
            title: 'Meeting invite',
            message: `${host?.name || 'A teammate'} invited you to "${meeting.title}".`,
            userId,
            link: `/meetings/${meeting.id}`,
          })
          .catch((error) => this.logger.warn(`Meeting invite for ${userId} failed: ${error?.message || error}`)),
      ),
    );
  }

  private async present(rows: Meeting[], actor: MeetingActor) {
    if (!rows.length) return [];
    const ids = rows.map((m) => m.id);
    const allInvitees = await this.invitees.find({ where: { meetingId: In(ids) } });
    const users = await this.hubUsers.load([...rows.map((m) => m.hostId), ...allInvitees.map((i) => i.userId)]);
    const projectIds = [...new Set(rows.map((m) => m.projectId).filter((id): id is string => !!id))];
    const projects = projectIds.length
      ? await this.projects.find({ select: ['id', 'clientName'], where: { id: In(projectIds) } })
      : [];
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const userOf = (id: string): SafeUser | null => users.get(id) ?? null;

    return rows.map((m) => {
      const isHost = m.hostId === actor.userId;
      const project = m.projectId ? projectById.get(m.projectId) : null;
      return {
        id: m.id,
        title: m.title,
        notes: m.notes,
        startsAt: m.startsAt,
        durationMinutes: m.durationMinutes,
        status: m.status,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        host: userOf(m.hostId),
        isHost,
        project: project ? { id: project.id, name: project.clientName } : null,
        invitees: allInvitees
          .filter((i) => i.meetingId === m.id)
          .map((i) => ({ user: userOf(i.userId), joinedAt: i.joinedAt }))
          .filter((i) => i.user),
        // The guest link is only ever given to the host.
        guestCode: isHost ? m.guestCode : null,
        guestLinkEnabled: isHost ? m.guestLinkEnabled : null,
      };
    });
  }
}
