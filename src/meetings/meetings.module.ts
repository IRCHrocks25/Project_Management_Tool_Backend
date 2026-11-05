import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { Project } from '../projects/entities/project.entity';
import { MeetingGuest } from './entities/meeting-guest.entity';
import { MeetingInvitee } from './entities/meeting-invitee.entity';
import { Meeting } from './entities/meeting.entity';
import { MeetingsController, PublicMeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

// Meetings: video calls inside the platform. The video itself runs on LiveKit; this only schedules
// meetings, decides who may join and hands out join tokens. Contract: docs/meetings.md.
@Module({
  imports: [
    TypeOrmModule.forFeature([Meeting, MeetingInvitee, MeetingGuest, Project]),
    // Limits are set per route on PublicMeetingsController; this is the fallback.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    NotificationsModule,
    ProductsModule, // HubUsersService: safe user shapes
  ],
  controllers: [MeetingsController, PublicMeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
