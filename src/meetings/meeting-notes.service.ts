import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { IncomingMessage } from 'http';
import { In, Not, IsNull, Repository } from 'typeorm';
import { EmailSection, EmailService } from '../email/email.service';
import { HubUsersService } from '../products/hub-users.service';
import { Project } from '../projects/entities/project.entity';
import { publicAppUrl } from '../shared/public-app-url';
import { TaskType } from '../tasks/entities/task.entity';
import { TasksService } from '../tasks/tasks.service';
import { User } from '../users/entities/user.entity';
import { ListenDto } from './dto/meetings.dto';
import { MeetingInvitee } from './entities/meeting-invitee.entity';
import {
  MeetingNote,
  MeetingNoteChunk,
  MeetingNoteItem,
  MeetingNotePreference,
  MeetingNoteRecipient,
} from './entities/meeting-note.entity';
import { MeetingRecording } from './entities/meeting-recording.entity';
import { Meeting } from './entities/meeting.entity';
import { canJoin } from './meeting-rules';
import { MeetingActor, MeetingsService } from './meetings.service';
import {
  NoteSummary,
  RawUtterance,
  SUMMARY_SCHEMA,
  SUMMARY_SYSTEM_PROMPT,
  TranscriptLine,
  buildTranscript,
  decideCapture,
  parseDeepgram,
  readSummary,
  transcriptText,
} from './notes-pipeline';

export const NOTES_MODEL = 'claude-opus-5-5';
const DEEPGRAM_QUERY = 'model=nova-3&diarize=true&punctuate=true&smart_format=true&utterances=true&detect_language=true';
const NOT_SET_UP = "Notes aren't set up yet. Add the transcription and Claude keys to the server.";
const NOT_FOUND = 'These notes no longer exist.';

const SWEEP_EVERY_MS = 30_000;
/** Lets the last audio arrive after a call ends. */
const CLOSE_GRACE_MS = 20_000;
/** With nobody left listening for this long, the notes are finished. */
const LISTENER_GONE_MS = 3 * 60_000;
const STUCK_PROCESSING_MS = 30 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 2 * 60_000;
const FAILED_AUDIO_KEPT_DAYS = 7;
const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_SPANS = 20_000;
const TRANSCRIBE_TIMEOUT_MS = 15 * 60_000;
const LIST_LIMIT = 200;
const EMAIL_ITEMS = 3;

/** Turns call audio into notes. One browser captures; a timer here does the rest, so it survives everyone closing their tabs. */
@Injectable()
export class MeetingNotesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingNotesService.name);
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private readonly makingTask = new Set<string>();
  /** Replaced in tests. */
  clientFactory: () => any = () => new Anthropic();

  constructor(
    @InjectRepository(MeetingNote) private readonly notes: Repository<MeetingNote>,
    @InjectRepository(MeetingNoteRecipient) private readonly recipients: Repository<MeetingNoteRecipient>,
    @InjectRepository(MeetingNoteChunk) private readonly chunks: Repository<MeetingNoteChunk>,
    @InjectRepository(MeetingNoteItem) private readonly items: Repository<MeetingNoteItem>,
    @InjectRepository(MeetingNotePreference) private readonly preferencesRepo: Repository<MeetingNotePreference>,
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingInvitee) private readonly invitees: Repository<MeetingInvitee>,
    @InjectRepository(MeetingRecording) private readonly recordings: Repository<MeetingRecording>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly meetingsService: MeetingsService,
    private readonly hubUsers: HubUsersService,
    private readonly tasks: TasksService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get available() {
    const claude = this.config.get('ANTHROPIC_API_KEY') || this.config.get('ANTHROPIC_AUTH_TOKEN');
    return !!this.config.get('DEEPGRAM_API_KEY') && !!claude;
  }

  /* ---------------------------- The switch ---------------------------- */

  async preferences(actor: MeetingActor) {
    const row = await this.preferencesRepo.findOne({ where: { userId: actor.userId } });
    return { autoNotes: !!row?.autoNotes, available: this.available };
  }

  async setPreferences(autoNotes: boolean, actor: MeetingActor) {
    await this.preferencesRepo.save({ userId: actor.userId, autoNotes, updatedAt: new Date() });
    return { autoNotes, available: this.available };
  }

  /* ---------------------------- During the call ---------------------------- */

  /** Marks this person as listening and says whether their browser should be the one capturing. */
  async listen(meetingId: string, dto: ListenDto, actor: MeetingActor) {
    const visible = await this.meetingsService.visibleMeeting(meetingId, actor);
    if (!canJoin(visible)) throw new GoneException('This meeting has finished.');
    if (!this.available) throw new ServiceUnavailableException(NOT_SET_UP);

    const result = await this.notes.manager.transaction(async (tx) => {
      // Holding the meeting row means two people joining at once can't each start their own notes.
      const meeting = await tx.findOneOrFail(Meeting, { where: { id: meetingId }, lock: { mode: 'pessimistic_write' } });
      if (meeting.notesBlocked) return { blocked: true as const };

      const now = new Date();
      let note = await tx.findOne(MeetingNote, { where: { meetingId, status: 'capturing' } });
      const created = !note;
      if (!note) note = await tx.save(tx.create(MeetingNote, { meetingId, status: 'capturing', startedAt: now, lastActivityAt: now }));

      const existing = await tx.findOne(MeetingNoteRecipient, { where: { noteId: note.id, userId: actor.userId } });
      const joined = !existing?.lastSeenAt;
      await tx.save(MeetingNoteRecipient, {
        noteId: note.id,
        userId: actor.userId,
        lastSeenAt: now,
        emailedAt: existing?.emailedAt ?? null,
        createdAt: existing?.createdAt ?? now,
      });

      const current = note.segments.length ? note.segments[note.segments.length - 1].n : null;
      const decision = decideCapture({
        capturerId: note.capturerId,
        leaseAt: note.capturerLeaseAt,
        currentSegment: current,
        me: actor.userId,
        mySegment: dto.segment ?? null,
        now,
      });
      let segment: number | null = null;
      if (decision === 'keep') {
        segment = current;
        note.capturerLeaseAt = now;
      } else if (decision === 'take') {
        segment = current === null ? 0 : current + 1;
        note.segments = [
          ...note.segments,
          { n: segment, ownerId: actor.userId, contentType: dto.contentType || 'audio/webm', startedAt: now.toISOString() },
        ];
        note.capturerId = actor.userId;
        note.capturerLeaseAt = now;
      }

      if (dto.speakers?.length && note.speakerSpans.length < MAX_SPANS) {
        const mine = new Set(note.segments.filter((s) => s.ownerId === actor.userId).map((s) => s.n));
        note.speakerSpans = [...note.speakerSpans, ...dto.speakers.filter((s) => mine.has(s.segment)).map((s) => ({ ...s }))];
      }
      note.lastActivityAt = now;
      await tx.save(note);
      return { blocked: false as const, noteId: note.id, capturing: segment !== null, segment, changed: created || joined };
    });

    if (result.blocked) return { blocked: true, capturing: false, noteId: null, segment: null };
    // Repeated while capturing: if one update is lost, nobody should stay unaware that notes are running.
    if (result.changed || result.capturing) await this.meetingsService.syncRoomFlags(visible);
    return { blocked: false, capturing: result.capturing, noteId: result.noteId, segment: result.segment };
  }

  /** They left or turned notes off. They still get the notes for what was captured while they were listening. */
  async leave(meetingId: string, actor: MeetingActor) {
    const meeting = await this.meetingsService.visibleMeeting(meetingId, actor);
    const note = await this.notes.findOne({ where: { meetingId, status: 'capturing' } });
    if (!note) return { left: true };
    await this.recipients.update({ noteId: note.id, userId: actor.userId }, { lastSeenAt: null });
    if (note.capturerId === actor.userId) await this.notes.update(note.id, { capturerId: null, capturerLeaseAt: null });
    const others = await this.recipients.count({ where: { noteId: note.id, lastSeenAt: Not(IsNull()) } });
    if (!others) await this.notes.update(note.id, { status: 'closing', closingAt: new Date(), capturerId: null });
    await this.meetingsService.syncRoomFlags(meeting);
    return { left: true };
  }

  /** Host only. Stopping also deletes what was captured, because the usual reason is that someone objected. */
  async setBlocked(meetingId: string, blocked: boolean, actor: MeetingActor) {
    const meeting = await this.meetingsService.hostedMeeting(meetingId, actor);
    meeting.notesBlocked = blocked;
    await this.meetings.save(meeting);
    if (blocked) await this.notes.delete({ meetingId, status: 'capturing' });
    await this.meetingsService.syncRoomFlags(meeting);
    return { blocked };
  }

  async addChunk(meetingId: string, noteId: string, segment: number, seq: number, body: IncomingMessage, actor: MeetingActor) {
    await this.meetingsService.visibleMeeting(meetingId, actor);
    const note = await this.notes.findOne({ where: { id: noteId, meetingId } });
    // Late audio is still welcome while closing, because the call may have just ended.
    if (!note || (note.status !== 'capturing' && note.status !== 'closing')) throw new GoneException('These notes have finished.');
    if (!note.segments.some((s) => s.n === segment && s.ownerId === actor.userId)) {
      throw new BadRequestException("This browser isn't capturing these notes.");
    }
    if (!Number.isInteger(seq) || seq < 0 || seq > 1_000_000) throw new BadRequestException('That audio chunk is not valid.');
    const data = await this.readBody(body);
    if (!data.length) throw new BadRequestException('That audio chunk is empty.');
    // A retried chunk is ignored rather than stored twice.
    await this.chunks.createQueryBuilder().insert().values({ noteId, segment, seq, data }).orIgnore().execute();
    return { saved: true };
  }

  private readBody(body: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parts: Buffer[] = [];
      let size = 0;
      body.on('data', (part: Buffer) => {
        size += part.length;
        if (size > MAX_CHUNK_BYTES) {
          reject(new PayloadTooLargeException('That audio chunk is too large.'));
          body.destroy();
          return;
        }
        parts.push(part);
      });
      body.on('end', () => resolve(Buffer.concat(parts)));
      body.on('error', reject);
      body.on('aborted', () => reject(new BadRequestException('The upload stopped early.')));
    });
  }

  /* ---------------------------- After the call ---------------------------- */

  /** Runs on a timer. The status change is what claims a note, so this stays safe with more than one server. */
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.closeAbandoned();
      await this.notes
        .createQueryBuilder()
        .update()
        .set({ status: 'closing', closingAt: () => 'now()' })
        .where(`status = 'processing' AND "processingAt" < :stuck`, { stuck: new Date(Date.now() - STUCK_PROCESSING_MS) })
        .execute();
      await this.chunks.query(
        `DELETE FROM meeting_note_chunks c USING meeting_notes n
         WHERE c."noteId" = n.id AND n.status = 'failed' AND n."lastActivityAt" < now() - make_interval(days => $1)`,
        [FAILED_AUDIO_KEPT_DAYS],
      );
      if (!this.available) return;
      const due = await this.notes
        .createQueryBuilder('n')
        .select('n.id', 'id')
        .where(`n.status = 'closing' AND n."closingAt" <= :due`, { due: new Date(Date.now() - CLOSE_GRACE_MS) })
        .orderBy('n."closingAt"', 'ASC')
        .limit(5)
        .getRawMany<{ id: string }>();
      for (const { id } of due) {
        const claimed = await this.notes
          .createQueryBuilder()
          .update()
          .set({ status: 'processing', processingAt: () => 'now()', attempts: () => 'attempts + 1' })
          .where(`id = :id AND status = 'closing'`, { id })
          .execute();
        // eslint-disable-next-line no-await-in-loop
        if (claimed.affected) await this.process(id);
      }
    } catch (error) {
      this.logger.error(`Notes sweep failed: ${error?.message || error}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async closeAbandoned() {
    const cutoff = new Date(Date.now() - LISTENER_GONE_MS);
    const closed: { id: string; meetingId: string }[] = await this.notes.query(
      `UPDATE meeting_notes n SET status = 'closing', "closingAt" = now(), "capturerId" = NULL
       WHERE n.status = 'capturing' AND n."lastActivityAt" < $1
         AND NOT EXISTS (SELECT 1 FROM meeting_note_recipients r WHERE r."noteId" = n.id AND r."lastSeenAt" >= $1)
       RETURNING n.id, n."meetingId"`,
      [cutoff],
    ).then((result: any) => (Array.isArray(result?.[0]) ? result[0] : result));
    for (const { meetingId } of closed) {
      // eslint-disable-next-line no-await-in-loop
      const meeting = await this.meetings.findOne({ where: { id: meetingId } });
      // eslint-disable-next-line no-await-in-loop
      if (meeting) await this.meetingsService.syncRoomFlags(meeting);
    }
  }

  /** Public for tests. Expects the note already claimed. */
  async process(id: string) {
    const note = await this.notes.findOne({ where: { id } });
    if (!note) return;
    const meeting = await this.meetings.findOne({ where: { id: note.meetingId } });
    try {
      if (!note.transcript) {
        const done = await this.transcribe(note);
        if (!done) return;
      }
      await this.summarise(note, meeting);
      await this.emailReady(note, meeting);
    } catch (error) {
      this.logger.error(`Could not finish notes ${id} (attempt ${note.attempts}): ${error?.message || error}`);
      if (note.attempts >= MAX_ATTEMPTS) {
        await this.notes.update(id, { status: 'failed', lastActivityAt: new Date() });
        await this.emailFailed(note, meeting);
      } else {
        await this.notes.update(id, { status: 'closing', closingAt: new Date(Date.now() + RETRY_AFTER_MS) });
      }
    }
  }

  /** Returns false if there was nothing to transcribe. The audio is deleted as soon as the transcript is safe. */
  private async transcribe(note: MeetingNote): Promise<boolean> {
    const parts: { segment: MeetingNote['segments'][number]; utterances: RawUtterance[] }[] = [];
    let language: string | null = null;
    for (const segment of note.segments) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await this.chunks.find({ where: { noteId: note.id, segment: segment.n }, order: { seq: 'ASC' } });
      if (rows.length) {
        // eslint-disable-next-line no-await-in-loop
        const parsed = await this.callDeepgram(Buffer.concat(rows.map((r) => r.data)), segment.contentType);
        parts.push({ segment, utterances: parsed.utterances });
        language = language || parsed.language;
      }
    }
    const transcript = buildTranscript(parts, note.speakerSpans);
    if (!transcript.length) {
      await this.notes.update(note.id, { status: 'empty', readyAt: new Date() });
      await this.chunks.delete({ noteId: note.id });
      return false;
    }
    note.transcript = transcript;
    note.language = language;
    note.durationSeconds = Math.round(transcript[transcript.length - 1].end);
    await this.notes.update(note.id, {
      transcript: transcript as any,
      language,
      durationSeconds: note.durationSeconds,
    });
    await this.chunks.delete({ noteId: note.id });
    return true;
  }

  private async callDeepgram(audio: Buffer, contentType: string) {
    const base = (this.config.get<string>('DEEPGRAM_BASE_URL') || 'https://api.deepgram.com').replace(/\/$/, '');
    const response = await fetch(`${base}/v1/listen?${DEEPGRAM_QUERY}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.config.get<string>('DEEPGRAM_API_KEY')}`, 'Content-Type': contentType.split(';')[0] },
      body: new Uint8Array(audio),
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Deepgram answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return parseDeepgram(await response.json());
  }

  private async summarise(note: MeetingNote, meeting: Meeting | null) {
    const summary = await this.callClaude(note.transcript as TranscriptLine[], meeting?.title || 'Meeting');
    await this.notes.manager.transaction(async (tx) => {
      await tx.delete(MeetingNoteItem, { noteId: note.id });
      if (summary.actionItems.length) {
        await tx.insert(
          MeetingNoteItem,
          summary.actionItems.map((item, position) => ({
            noteId: note.id,
            position,
            text: item.text,
            ownerName: item.owner ? item.owner.slice(0, 120) : null,
          })),
        );
      }
      await tx.update(MeetingNote, note.id, {
        status: 'ready',
        overview: summary.overview,
        topics: summary.topics as any,
        readyAt: new Date(),
      });
    });
    note.overview = summary.overview;
  }

  private async callClaude(lines: TranscriptLine[], title: string): Promise<NoteSummary> {
    const client = this.clientFactory();
    // Streamed because a long call's transcript can outlast a plain request's timeout.
    const message = await client.beta.messages
      .stream({
        model: NOTES_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Meeting title: ${title}\n\n<transcript>\n${transcriptText(lines)}\n</transcript>`,
          },
        ],
      })
      .finalMessage();
    return readSummary(message);
  }

  /* ---------------------------- Emails ---------------------------- */

  private noteLink(id: string) {
    return `${publicAppUrl(this.config.get<string>('FRONTEND_URL'))}/meetings/notes/${id}`;
  }

  private async emailReady(note: MeetingNote, meeting: Meeting | null) {
    const pending = await this.recipients.find({ where: { noteId: note.id, emailedAt: IsNull() } });
    await this.sendNoteEmail(note, meeting, pending.map((r) => r.userId));
  }

  private async sendNoteEmail(note: MeetingNote, meeting: Meeting | null, userIds: string[]) {
    if (!userIds.length) return;
    const items = await this.items.find({ where: { noteId: note.id }, order: { position: 'ASC' } });
    const sections: EmailSection[] = items.length
      ? [
          {
            heading: items.length > EMAIL_ITEMS ? `Action items (top ${EMAIL_ITEMS} of ${items.length})` : 'Action items',
            bullets: items.slice(0, EMAIL_ITEMS).map((i) => (i.ownerName ? `${i.text} (${i.ownerName})` : i.text)),
          },
        ]
      : [];
    const users = await this.users.find({ select: ['id', 'name', 'email'], where: { id: In(userIds) } });
    for (const user of users) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.email.sendNotification({
          to: user.email,
          userName: user.name,
          title: `Meeting summary for ${meeting?.title || 'your call'}`,
          message: note.overview || '',
          sections,
          viewLink: this.noteLink(note.id),
          viewLabel: 'View in Telos',
          footer: 'You get this because you had notes on for this call, or someone shared these notes with you.',
        });
        // eslint-disable-next-line no-await-in-loop
        await this.recipients.update({ noteId: note.id, userId: user.id }, { emailedAt: new Date() });
      } catch (error) {
        // The notes are still on the Notes tab, so one lost email isn't worth failing them.
        this.logger.warn(`Could not email notes ${note.id} to ${user.id}: ${error?.message || error}`);
      }
    }
  }

  private async emailFailed(note: MeetingNote, meeting: Meeting | null) {
    const rows = await this.recipients.find({ where: { noteId: note.id } });
    const users = await this.users.find({ select: ['id', 'name', 'email'], where: { id: In(rows.map((r) => r.userId)) } });
    for (const user of users) {
      // eslint-disable-next-line no-await-in-loop
      await this.email
        .sendNotification({
          to: user.email,
          userName: user.name,
          title: `We couldn't finish the notes for ${meeting?.title || 'your call'}`,
          message: 'The audio is safe for now. Open the notes and choose Try again.',
          viewLink: this.noteLink(note.id),
          viewLabel: 'Open the notes',
          footer: 'You get this because you had notes on for this call.',
        })
        .catch((error) => this.logger.warn(`Could not email failed notes ${note.id}: ${error?.message || error}`));
    }
  }

  /* ---------------------------- The Notes tab ---------------------------- */

  async list(actor: MeetingActor) {
    const mine = await this.recipients.find({ select: ['noteId'], where: { userId: actor.userId } });
    if (!mine.length) return { notes: [] };
    const rows = await this.notes.find({
      select: ['id', 'meetingId', 'status', 'overview', 'durationSeconds', 'startedAt'],
      where: { id: In(mine.map((r) => r.noteId)) },
      order: { startedAt: 'DESC' },
      take: LIST_LIMIT,
    });
    const meetings = rows.length ? await this.meetings.find({ select: ['id', 'title'], where: { id: In(rows.map((r) => r.meetingId)) } }) : [];
    const titles = new Map(meetings.map((m) => [m.id, m.title]));
    return {
      notes: rows.map((r) => ({
        id: r.id,
        title: titles.get(r.meetingId) ?? 'Meeting',
        status: this.publicStatus(r.status),
        overview: r.overview,
        durationSeconds: r.durationSeconds,
        startedAt: r.startedAt,
      })),
    };
  }

  /** People only need to know it's being worked on, not which internal step it's at. */
  private publicStatus(status: MeetingNote['status']) {
    return status === 'closing' || status === 'processing' ? 'processing' : status;
  }

  async get(id: string, actor: MeetingActor) {
    const note = await this.ownNote(id, actor);
    const meeting = await this.meetings.findOne({ where: { id: note.meetingId } });
    const [items, rows] = await Promise.all([
      this.items.find({ where: { noteId: id }, order: { position: 'ASC' } }),
      this.recipients.find({ where: { noteId: id } }),
    ]);
    const users = await this.hubUsers.load(rows.map((r) => r.userId));
    const project = meeting?.projectId ? await this.projects.findOne({ select: ['id', 'clientName'], where: { id: meeting.projectId } }) : null;
    return {
      id: note.id,
      meetingId: note.meetingId,
      title: meeting?.title ?? 'Meeting',
      status: this.publicStatus(note.status),
      startedAt: note.startedAt,
      durationSeconds: note.durationSeconds,
      language: note.language,
      overview: note.overview,
      topics: note.topics ?? [],
      items: items.map((i) => this.shapeItem(i)),
      transcript: note.transcript ?? [],
      recipients: rows.map((r) => users.get(r.userId)).filter(Boolean),
      project: project ? { id: project.id, name: project.clientName } : null,
      hasRecording: meeting ? await this.canWatchRecording(meeting, actor) : false,
    };
  }

  /** Someone the notes were shared with doesn't automatically get the video. */
  private async canWatchRecording(meeting: Meeting, actor: MeetingActor) {
    const member =
      meeting.hostId === actor.userId || (await this.invitees.count({ where: { meetingId: meeting.id, userId: actor.userId } })) > 0;
    if (!member) return false;
    return (await this.recordings.count({ where: { meetingId: meeting.id, status: 'ready' } })) > 0;
  }

  /** Removes it for this person only. Once nobody has it, it's deleted. */
  async remove(id: string, actor: MeetingActor) {
    await this.ownNote(id, actor);
    await this.recipients.delete({ noteId: id, userId: actor.userId });
    if (!(await this.recipients.count({ where: { noteId: id } }))) await this.notes.delete(id);
    return { removed: true };
  }

  async retry(id: string, actor: MeetingActor) {
    const note = await this.ownNote(id, actor);
    if (note.status !== 'failed') throw new BadRequestException("These notes don't need another try.");
    await this.notes.update(id, { status: 'closing', closingAt: new Date(Date.now() - CLOSE_GRACE_MS), attempts: 0 });
    return { status: 'processing' };
  }

  async share(id: string, userIds: string[], actor: MeetingActor) {
    const note = await this.ownNote(id, actor);
    if (note.status !== 'ready') throw new BadRequestException('You can share these notes once they are ready.');
    const known = await this.hubUsers.load(userIds);
    const existing = await this.recipients.find({ select: ['userId'], where: { noteId: id, userId: In([...known.keys()]) } });
    const already = new Set(existing.map((r) => r.userId));
    const added = [...known.keys()].filter((userId) => !already.has(userId));
    if (added.length) await this.recipients.insert(added.map((userId) => ({ noteId: id, userId })));
    const meeting = await this.meetings.findOne({ where: { id: note.meetingId } });
    await this.sendNoteEmail(note, meeting, added);
    return { shared: added.length };
  }

  async setItemDone(id: string, itemId: string, done: boolean, actor: MeetingActor) {
    await this.ownNote(id, actor);
    const item = await this.ownItem(id, itemId);
    item.done = done;
    await this.items.save(item);
    return this.shapeItem(item);
  }

  /** Assigned to whoever clicks it, since the name Claude picked out may not be right. */
  async makeTask(id: string, itemId: string, projectId: string | undefined, actor: MeetingActor) {
    const note = await this.ownNote(id, actor);
    const item = await this.ownItem(id, itemId);
    if (item.taskId) return this.shapeItem(item);
    const meeting = await this.meetings.findOne({ where: { id: note.meetingId } });
    const project = projectId || meeting?.projectId;
    if (!project) throw new BadRequestException('Choose a project for this task.');
    if (!(await this.projects.count({ where: { id: project } }))) throw new BadRequestException('That project no longer exists.');
    if (this.makingTask.has(itemId)) throw new BadRequestException('That task is already being made.');
    this.makingTask.add(itemId);
    try {
      const task: any = await this.tasks.create(
        {
          projectId: project,
          title: item.text.slice(0, 250),
          type: TaskType.GENERAL,
          description: `From the meeting "${meeting?.title ?? 'Meeting'}". Notes: ${this.noteLink(id)}`,
          assignedToId: actor.userId,
        },
        actor.userId,
      );
      item.taskId = task.id;
      await this.items.save(item);
    } finally {
      this.makingTask.delete(itemId);
    }
    return this.shapeItem(item);
  }

  private async ownNote(id: string, actor: MeetingActor) {
    const isRecipient = await this.recipients.count({ where: { noteId: id, userId: actor.userId } });
    if (!isRecipient) throw new NotFoundException(NOT_FOUND);
    const note = await this.notes.findOne({ where: { id } });
    if (!note) throw new NotFoundException(NOT_FOUND);
    return note;
  }

  private async ownItem(noteId: string, itemId: string) {
    const item = await this.items.findOne({ where: { id: itemId, noteId } });
    if (!item) throw new NotFoundException('That action item no longer exists.');
    return item;
  }

  private shapeItem(i: MeetingNoteItem) {
    return { id: i.id, text: i.text, ownerName: i.ownerName, done: i.done, taskId: i.taskId };
  }
}
