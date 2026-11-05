import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

/** A video call inside the platform. The call itself runs on LiveKit, in the room named `roomName`. */
@Entity('meetings')
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column('text', { nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'int', default: 30 })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 20, default: 'scheduled' })
  status: MeetingStatus;

  @Column('uuid')
  hostId: string;

  @Column('uuid', { nullable: true })
  projectId: string | null;

  @Column({ length: 64, unique: true })
  roomName: string;

  /** The secret part of the guest link. */
  @Column({ length: 64, unique: true })
  guestCode: string;

  @Column({ default: true })
  guestLinkEnabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
