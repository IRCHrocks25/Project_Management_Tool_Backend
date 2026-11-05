import { Column, Entity, PrimaryColumn } from 'typeorm';

/** A teammate invited to a meeting. `joinedAt` is when they first joined, so it doubles as attendance. */
@Entity('meeting_invitees')
export class MeetingInvitee {
  @PrimaryColumn('uuid')
  meetingId: string;

  @PrimaryColumn('uuid')
  userId: string;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;
}
