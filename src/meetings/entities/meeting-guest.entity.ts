import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type MeetingGuestStatus = 'waiting' | 'admitted' | 'denied';

/** Someone without an account who opened the guest link. They wait until the host admits them. */
@Entity('meeting_guests')
export class MeetingGuest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  meetingId: string;

  @Column({ length: 80 })
  name: string;

  /** SHA-256 of the secret handed to the guest's browser. It proves a status check is theirs. */
  @Column({ length: 64, select: false })
  secretHash: string;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status: MeetingGuestStatus;

  /** Updated each time the guest checks in, so people who closed the tab drop off the host's list. */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  admittedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
