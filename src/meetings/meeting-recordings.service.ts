import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IncomingMessage, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { In, Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';
import { IcebergMultipartPart, IcebergService } from '../shared/iceberg.service';
import { BeginRecordingUploadDto, StopRecordingDto } from './dto/meetings.dto';
import { MeetingInvitee } from './entities/meeting-invitee.entity';
import { MeetingRecording } from './entities/meeting-recording.entity';
import { Meeting } from './entities/meeting.entity';
import { isClosed } from './meeting-rules';
import { MeetingActor, MeetingsService } from './meetings.service';

export const PLAYBACK_LINK_SECONDS = 4 * 60 * 60;
const LIST_LIMIT = 200;

/** Records are made in the host's browser; these routes track them and pass the file on to Iceberg. */
@Injectable()
export class MeetingRecordingsService {
  private readonly logger = new Logger(MeetingRecordingsService.name);

  constructor(
    @InjectRepository(MeetingRecording) private readonly recordings: Repository<MeetingRecording>,
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    @InjectRepository(MeetingInvitee) private readonly invitees: Repository<MeetingInvitee>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly meetingsService: MeetingsService,
    private readonly iceberg: IcebergService,
  ) {}

  /** Host only. Everyone in the call sees the recording badge from the room's metadata. */
  async start(meetingId: string, actor: MeetingActor) {
    const meeting = await this.meetingsService.hostedMeeting(meetingId, actor);
    if (isClosed(meeting.status)) throw new GoneException('This meeting has finished.');
    this.meetingsService.requireLiveKit();
    await this.recordings.update({ meetingId, status: 'recording' }, { status: 'failed', endedAt: new Date() });
    const recording = await this.recordings.save(
      this.recordings.create({ meetingId, startedById: actor.userId, status: 'recording' }),
    );
    try {
      await this.meetingsService.syncRoomFlags(meeting, true);
    } catch (error) {
      await this.recordings.delete(recording.id);
      this.logger.warn(`Could not flag recording on meeting ${meetingId}: ${error?.message || error}`);
      throw new ServiceUnavailableException("Couldn't start recording. Try again.");
    }
    return { id: recording.id };
  }

  async stop(meetingId: string, id: string, dto: StopRecordingDto, actor: MeetingActor) {
    const { meeting, recording } = await this.hosted(meetingId, id, actor);
    if (recording.status === 'recording') {
      recording.status = 'uploading';
      recording.endedAt = new Date();
      recording.durationSeconds = dto.durationSeconds;
      await this.recordings.save(recording);
    }
    await this.meetingsService.syncRoomFlags(meeting);
    return { status: recording.status };
  }

  async beginUpload(meetingId: string, id: string, dto: BeginRecordingUploadDto, actor: MeetingActor) {
    const { recording } = await this.hosted(meetingId, id, actor);
    if (recording.status !== 'uploading') throw new BadRequestException('This recording has already been saved.');
    const extension = dto.contentType.startsWith('video/mp4') ? 'mp4' : 'webm';
    const contentType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const key = `PM_tool/meetings/${meetingId}/${id}.${extension}`;
    const session = await this.iceberg.initMultipartUpload(key, contentType, dto.sizeBytes, `meeting-recording-${id}-${dto.sizeBytes}`);
    recording.uploadId = session.uploadId;
    recording.assetId = session.assetId;
    recording.assetKey = key;
    recording.contentType = contentType;
    recording.sizeBytes = String(dto.sizeBytes);
    await this.recordings.save(recording);
    return { partSize: session.partSize };
  }

  /**
   * Passes one part from the browser straight on to Iceberg's storage, without holding it in memory.
   * The browser can't send it directly because the storage bucket only accepts Iceberg's own website.
   */
  async uploadPart(meetingId: string, id: string, partNumber: number, body: IncomingMessage, actor: MeetingActor) {
    const { recording } = await this.hosted(meetingId, id, actor);
    if (recording.status !== 'uploading' || !recording.uploadId) throw new BadRequestException('Start the upload first.');
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) throw new BadRequestException('That part is not valid.');
    const length = Number(body.headers['content-length']);
    if (!Number.isInteger(length) || length <= 0) throw new BadRequestException('That part is empty.');
    if (length > this.iceberg.maxPartBytes) throw new PayloadTooLargeException('That part is too large.');

    const uploadUrl = await this.iceberg.signMultipartPart(recording.uploadId, partNumber);
    const etag = await this.forward(uploadUrl, body, length);
    return { etag };
  }

  async complete(meetingId: string, id: string, parts: IcebergMultipartPart[], actor: MeetingActor) {
    const { recording } = await this.hosted(meetingId, id, actor);
    if (recording.status === 'ready') return this.shapeOne(recording);
    if (recording.status !== 'uploading' || !recording.uploadId || !recording.assetId) {
      throw new BadRequestException('Start the upload first.');
    }
    try {
      const session = await this.iceberg.completeMultipartUpload(recording.uploadId, parts);
      if (session.status === 'uploading' || session.status === 'finalizing' || session.status === 'validating') {
        return this.shapeOne(recording); // Iceberg is still checking it; the browser asks again.
      }
      if (session.status !== 'completed') throw new Error(`Iceberg ${session.status} it: ${session.reason}`);
      // Set straight after it's accepted, and the asset id has never left this server.
      await this.iceberg.setAssetPrivate(recording.assetId);
    } catch (error) {
      await this.discardAsset(recording);
      recording.status = 'failed';
      await this.recordings.save(recording);
      this.logger.error(`Could not finish recording ${id}: ${error?.message || error}`);
      throw new ServiceUnavailableException("Couldn't save the recording.");
    }
    recording.status = 'ready';
    await this.recordings.save(recording);
    return this.shapeOne(recording);
  }

  /** The browser gave up uploading. */
  async fail(meetingId: string, id: string, actor: MeetingActor) {
    const { meeting, recording } = await this.hosted(meetingId, id, actor);
    if (recording.status !== 'ready') {
      if (recording.uploadId) await this.iceberg.abortMultipartUpload(recording.uploadId).catch(() => undefined);
      recording.status = 'failed';
      await this.recordings.save(recording);
    }
    await this.meetingsService.syncRoomFlags(meeting);
    return { status: recording.status };
  }

  /** Recordings of meetings this person hosts or was invited to. There is no CEO or PM override. */
  async list(actor: MeetingActor) {
    const invited = await this.invitees.find({ select: ['meetingId'], where: { userId: actor.userId } });
    const meetings = await this.meetings.find({
      select: ['id', 'title', 'hostId', 'projectId', 'startsAt'],
      where: [{ hostId: actor.userId }, { id: In(invited.map((i) => i.meetingId)) }],
    });
    if (!meetings.length) return { recordings: [] };
    const rows = await this.recordings.find({
      where: { meetingId: In(meetings.map((m) => m.id)), status: In(['uploading', 'ready', 'failed']) },
      order: { startedAt: 'DESC' },
      take: LIST_LIMIT,
    });
    const projectIds = [...new Set(meetings.map((m) => m.projectId).filter((p): p is string => !!p))];
    const projects = projectIds.length ? await this.projects.find({ select: ['id', 'clientName'], where: { id: In(projectIds) } }) : [];
    const meetingById = new Map(meetings.map((m) => [m.id, m]));
    const projectById = new Map(projects.map((p) => [p.id, p.clientName]));
    const recordings = rows
      .map((r) => {
        const meeting = meetingById.get(r.meetingId) as Meeting;
        return {
          ...this.shapeOne(r),
          title: meeting.title,
          projectName: meeting.projectId ? projectById.get(meeting.projectId) ?? null : null,
          canManage: meeting.hostId === actor.userId,
        };
      })
      // A failed recording is only useful to the host, who can delete it.
      .filter((r) => r.status !== 'failed' || r.canManage);
    return { recordings };
  }

  /** A short-lived private link. Checked on every request, so losing access takes effect on the next play. */
  async playback(id: string, actor: MeetingActor) {
    const recording = await this.recordings.findOne({ where: { id } });
    if (!recording) throw new NotFoundException('This recording no longer exists.');
    await this.meetingsService.visibleMeeting(recording.meetingId, actor);
    if (recording.status !== 'ready' || !recording.assetId) throw new BadRequestException("This recording isn't ready yet.");
    return this.iceberg.issuePrivateLink(recording.assetId, PLAYBACK_LINK_SECONDS);
  }

  async remove(meetingId: string, id: string, actor: MeetingActor) {
    const { recording } = await this.hosted(meetingId, id, actor);
    await this.discardAsset(recording, true);
    await this.recordings.delete(recording.id);
    return { deleted: true };
  }

  private async hosted(meetingId: string, id: string, actor: MeetingActor) {
    const meeting = await this.meetingsService.hostedMeeting(meetingId, actor);
    const recording = await this.recordings.findOne({ where: { id, meetingId } });
    if (!recording) throw new NotFoundException('This recording no longer exists.');
    return { meeting, recording };
  }

  private async discardAsset(recording: MeetingRecording, strict = false) {
    try {
      if (recording.status === 'uploading' && recording.uploadId) {
        await this.iceberg.abortMultipartUpload(recording.uploadId).catch(() => undefined);
      }
      if (recording.assetKey) await this.iceberg.trashAsset(recording.assetKey);
    } catch (error) {
      this.logger.error(`Could not delete recording ${recording.id} from Iceberg: ${error?.message || error}`);
      if (strict) throw new ServiceUnavailableException("Couldn't delete the recording. Try again.");
    }
  }

  private forward(url: string, body: IncomingMessage, length: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const send = url.startsWith('https:') ? httpsRequest : httpRequest;
      const upstream = send(url, { method: 'PUT', headers: { 'Content-Length': length } }, (res) => {
        res.resume();
        const etag = res.headers.etag;
        if (res.statusCode && res.statusCode < 300 && etag) resolve(etag);
        else {
          this.logger.error(`Iceberg storage answered ${res.statusCode} for a recording part`);
          reject(new ServiceUnavailableException("Couldn't upload the recording."));
        }
      });
      const fail = (error: Error) => {
        this.logger.warn(`Recording part upload stopped: ${error.message}`);
        upstream.destroy();
        reject(new ServiceUnavailableException("Couldn't upload the recording."));
      };
      upstream.on('error', fail);
      body.on('error', fail);
      body.on('aborted', () => fail(new Error('the browser disconnected')));
      body.pipe(upstream);
    });
  }

  private shapeOne(r: MeetingRecording) {
    return {
      id: r.id,
      meetingId: r.meetingId,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationSeconds: r.durationSeconds,
      sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes),
    };
  }
}
