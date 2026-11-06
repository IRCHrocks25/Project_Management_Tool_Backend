import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { Project } from '../projects/entities/project.entity';
import { SharedModule } from '../shared/shared.module';
import { TasksModule } from '../tasks/tasks.module';
import { User } from '../users/entities/user.entity';
import { MeetingGuest } from './entities/meeting-guest.entity';
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
import { MeetingNotesService } from './meeting-notes.service';
import { MeetingRecordingsService } from './meeting-recordings.service';
import { MeetingsController, PublicMeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

// Meetings: video calls inside the platform. The video itself runs on LiveKit; this only schedules
// meetings, decides who may join and hands out join tokens. Contract: docs/meetings.md.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Meeting,
      MeetingInvitee,
      MeetingGuest,
      MeetingRecording,
      MeetingNote,
      MeetingNoteRecipient,
      MeetingNoteChunk,
      MeetingNoteItem,
      MeetingNotePreference,
      Project,
      User,
    ]),
    // Limits are set per route on PublicMeetingsController; this is the fallback.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    NotificationsModule,
    SharedModule, // IcebergService: recordings
    ProductsModule, // HubUsersService: safe user shapes
    EmailModule, // Notes emails
    TasksModule, // "Make task" on an action item
  ],
  controllers: [MeetingsController, PublicMeetingsController],
  providers: [MeetingsService, MeetingRecordingsService, MeetingNotesService],
})
export class MeetingsModule {}
