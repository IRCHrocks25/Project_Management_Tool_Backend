import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientIpThrottlerGuard } from '../forms/forms.controller';
import { Uuid } from '../product-vault/product-vault.controller';
import {
  AskToJoinDto,
  BeginRecordingUploadDto,
  BlockNotesDto,
  CompleteRecordingDto,
  CreateMeetingDto,
  GuestDecisionDto,
  GuestLinkDto,
  GuestStatusDto,
  ListenDto,
  NoteItemDto,
  NoteItemTaskDto,
  NotePreferencesDto,
  ParticipantActionDto,
  ShareNoteDto,
  StopRecordingDto,
  UpdateMeetingDto,
} from './dto/meetings.dto';
import { MeetingNotesService } from './meeting-notes.service';
import { MeetingRecordingsService } from './meeting-recordings.service';
import { MeetingActor, MeetingsService } from './meetings.service';

const actorOf = (req: any): MeetingActor => ({ userId: req.user?.userId || req.user?.id });

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly recordings: MeetingRecordingsService,
    private readonly notes: MeetingNotesService,
  ) {}

  @Get()
  list(@Query('view') view: string, @Request() req: any) {
    return this.meetings.list(view, actorOf(req));
  }

  // Before the :id routes, so "recordings" isn't read as a meeting id.
  @Get('recordings')
  listRecordings(@Request() req: any) {
    return this.recordings.list(actorOf(req));
  }

  @Post('recordings/:recordingId/playback')
  @Header('Cache-Control', 'no-store')
  playback(@Param('recordingId', Uuid) recordingId: string, @Request() req: any) {
    return this.recordings.playback(recordingId, actorOf(req));
  }

  // Also before the :id routes, so "notes" isn't read as a meeting id.
  @Get('notes/preferences')
  notePreferences(@Request() req: any) {
    return this.notes.preferences(actorOf(req));
  }

  @Patch('notes/preferences')
  setNotePreferences(@Body() dto: NotePreferencesDto, @Request() req: any) {
    return this.notes.setPreferences(dto.autoNotes, actorOf(req));
  }

  @Get('notes')
  listNotes(@Request() req: any) {
    return this.notes.list(actorOf(req));
  }

  @Get('notes/:noteId')
  @Header('Cache-Control', 'no-store')
  getNote(@Param('noteId', Uuid) noteId: string, @Request() req: any) {
    return this.notes.get(noteId, actorOf(req));
  }

  @Delete('notes/:noteId')
  removeNote(@Param('noteId', Uuid) noteId: string, @Request() req: any) {
    return this.notes.remove(noteId, actorOf(req));
  }

  @Post('notes/:noteId/retry')
  retryNote(@Param('noteId', Uuid) noteId: string, @Request() req: any) {
    return this.notes.retry(noteId, actorOf(req));
  }

  @Post('notes/:noteId/share')
  shareNote(@Param('noteId', Uuid) noteId: string, @Body() dto: ShareNoteDto, @Request() req: any) {
    return this.notes.share(noteId, dto.userIds, actorOf(req));
  }

  @Patch('notes/:noteId/items/:itemId')
  updateNoteItem(
    @Param('noteId', Uuid) noteId: string,
    @Param('itemId', Uuid) itemId: string,
    @Body() dto: NoteItemDto,
    @Request() req: any,
  ) {
    return this.notes.setItemDone(noteId, itemId, dto.done, actorOf(req));
  }

  @Post('notes/:noteId/items/:itemId/task')
  makeTaskFromNoteItem(
    @Param('noteId', Uuid) noteId: string,
    @Param('itemId', Uuid) itemId: string,
    @Body() dto: NoteItemTaskDto,
    @Request() req: any,
  ) {
    return this.notes.makeTask(noteId, itemId, dto.projectId, actorOf(req));
  }

  @Post()
  create(@Body() dto: CreateMeetingDto, @Request() req: any) {
    return this.meetings.create(dto, actorOf(req));
  }

  @Get(':id')
  get(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.get(id, actorOf(req));
  }

  @Patch(':id')
  update(@Param('id', Uuid) id: string, @Body() dto: UpdateMeetingDto, @Request() req: any) {
    return this.meetings.update(id, dto, actorOf(req));
  }

  @Post(':id/join')
  @Header('Cache-Control', 'no-store')
  join(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.join(id, actorOf(req));
  }

  @Post(':id/end')
  end(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.end(id, actorOf(req));
  }

  @Post(':id/cancel')
  cancel(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.cancel(id, actorOf(req));
  }

  @Post(':id/guest-link')
  guestLink(@Param('id', Uuid) id: string, @Body() dto: GuestLinkDto, @Request() req: any) {
    return this.meetings.setGuestLink(id, dto, actorOf(req));
  }

  @Get(':id/guests')
  guests(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.waitingGuests(id, actorOf(req));
  }

  @Post(':id/guests/:guestId')
  decide(
    @Param('id', Uuid) id: string,
    @Param('guestId', Uuid) guestId: string,
    @Body() dto: GuestDecisionDto,
    @Request() req: any,
  ) {
    return this.meetings.decideGuest(id, guestId, dto.decision, actorOf(req));
  }

  @Post(':id/participants/mute')
  muteParticipant(@Param('id', Uuid) id: string, @Body() dto: ParticipantActionDto, @Request() req: any) {
    return this.meetings.muteParticipant(id, dto.identity, actorOf(req));
  }

  @Post(':id/participants/remove')
  removeParticipant(@Param('id', Uuid) id: string, @Body() dto: ParticipantActionDto, @Request() req: any) {
    return this.meetings.removeParticipant(id, dto.identity, actorOf(req));
  }

  /** Called every few seconds while someone in the call has notes on. */
  @Post(':id/notes/listen')
  listen(@Param('id', Uuid) id: string, @Body() dto: ListenDto, @Request() req: any) {
    return this.notes.listen(id, dto, actorOf(req));
  }

  @Post(':id/notes/leave')
  leaveNotes(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.notes.leave(id, actorOf(req));
  }

  @Post(':id/notes/block')
  blockNotes(@Param('id', Uuid) id: string, @Body() dto: BlockNotesDto, @Request() req: any) {
    return this.notes.setBlocked(id, dto.blocked, actorOf(req));
  }

  /** The body is a few seconds of raw audio. */
  @Put(':id/notes/:noteId/chunks/:segment/:seq')
  addNoteChunk(
    @Param('id', Uuid) id: string,
    @Param('noteId', Uuid) noteId: string,
    @Param('segment', ParseIntPipe) segment: number,
    @Param('seq', ParseIntPipe) seq: number,
    @Request() req: any,
  ) {
    return this.notes.addChunk(id, noteId, segment, seq, req, actorOf(req));
  }

  @Post(':id/recordings')
  startRecording(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.recordings.start(id, actorOf(req));
  }

  @Post(':id/recordings/:recordingId/stop')
  stopRecording(
    @Param('id', Uuid) id: string,
    @Param('recordingId', Uuid) recordingId: string,
    @Body() dto: StopRecordingDto,
    @Request() req: any,
  ) {
    return this.recordings.stop(id, recordingId, dto, actorOf(req));
  }

  @Post(':id/recordings/:recordingId/upload')
  beginRecordingUpload(
    @Param('id', Uuid) id: string,
    @Param('recordingId', Uuid) recordingId: string,
    @Body() dto: BeginRecordingUploadDto,
    @Request() req: any,
  ) {
    return this.recordings.beginUpload(id, recordingId, dto, actorOf(req));
  }

  /** The body is one raw part of the video, passed on to storage as it arrives. */
  @Put(':id/recordings/:recordingId/parts/:partNumber')
  uploadRecordingPart(
    @Param('id', Uuid) id: string,
    @Param('recordingId', Uuid) recordingId: string,
    @Param('partNumber', ParseIntPipe) partNumber: number,
    @Request() req: any,
  ) {
    return this.recordings.uploadPart(id, recordingId, partNumber, req, actorOf(req));
  }

  @Post(':id/recordings/:recordingId/complete')
  completeRecording(
    @Param('id', Uuid) id: string,
    @Param('recordingId', Uuid) recordingId: string,
    @Body() dto: CompleteRecordingDto,
    @Request() req: any,
  ) {
    return this.recordings.complete(id, recordingId, dto.parts, actorOf(req));
  }

  @Post(':id/recordings/:recordingId/fail')
  failRecording(@Param('id', Uuid) id: string, @Param('recordingId', Uuid) recordingId: string, @Request() req: any) {
    return this.recordings.fail(id, recordingId, actorOf(req));
  }

  @Delete(':id/recordings/:recordingId')
  deleteRecording(@Param('id', Uuid) id: string, @Param('recordingId', Uuid) recordingId: string, @Request() req: any) {
    return this.recordings.remove(id, recordingId, actorOf(req));
  }
}

/** Guest routes. No JwtAuthGuard on purpose: the code in the link is the credential. */
@Controller('public/meetings')
@UseGuards(ClientIpThrottlerGuard)
export class PublicMeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get(':code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  info(@Param('code') code: string) {
    return this.meetings.publicInfo(code);
  }

  @Post(':code/guests')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  ask(@Param('code') code: string, @Body() dto: AskToJoinDto) {
    return this.meetings.askToJoin(code, dto.name);
  }

  @Post(':code/guests/:guestId/status')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  status(@Param('code') code: string, @Param('guestId', Uuid) guestId: string, @Body() dto: GuestStatusDto) {
    return this.meetings.guestStatus(code, guestId, dto.secret);
  }
}
