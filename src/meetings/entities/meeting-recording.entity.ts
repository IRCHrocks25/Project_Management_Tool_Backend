import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type MeetingRecordingStatus = 'recording' | 'uploading' | 'ready' | 'failed';

/** A recording made in the host's browser. The video itself is a private asset in Iceberg. */
@Entity('meeting_recordings')
export class MeetingRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  meetingId: string;

  @Column({ type: 'uuid', nullable: true })
  startedById: string | null;

  @Column({ type: 'varchar', length: 20, default: 'recording' })
  status: MeetingRecordingStatus;

  @Column({ type: 'varchar', length: 120, nullable: true })
  uploadId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  assetKey: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  contentType: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;
}
