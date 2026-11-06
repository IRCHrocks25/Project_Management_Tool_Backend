import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { NoteSegment, SpeakerSpan, TranscriptLine, NoteTopic } from '../notes-pipeline';

export type MeetingNoteStatus = 'capturing' | 'closing' | 'processing' | 'ready' | 'empty' | 'failed';

/** Someone's standing choice to have notes taken on every call they join. */
@Entity('meeting_note_preferences')
export class MeetingNotePreference {
  @PrimaryColumn('uuid')
  userId: string;

  @Column({ default: false })
  autoNotes: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}

/** The notes for one sitting of a call. Only its recipients can see it, with no CEO or PM override. */
@Entity('meeting_notes')
export class MeetingNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  meetingId: string;

  @Column({ type: 'varchar', length: 20, default: 'capturing' })
  status: MeetingNoteStatus;

  /** Whose browser is capturing the audio right now. */
  @Column({ type: 'uuid', nullable: true })
  capturerId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  capturerLeaseAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  segments: NoteSegment[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  speakerSpans: SpeakerSpan[];

  @Column({ type: 'jsonb', nullable: true })
  transcript: TranscriptLine[] | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  language: string | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'text', nullable: true })
  overview: string | null;

  @Column({ type: 'jsonb', nullable: true })
  topics: NoteTopic[] | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastActivityAt: Date;

  /** Processing starts a little after this, so the last audio can still arrive. Set ahead of time for a retry. */
  @Column({ type: 'timestamptz', nullable: true })
  closingAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  processingAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  readyAt: Date | null;
}

@Entity('meeting_note_recipients')
export class MeetingNoteRecipient {
  @PrimaryColumn('uuid')
  noteId: string;

  @PrimaryColumn('uuid')
  userId: string;

  /** Set while they're in the call with notes on. Null once they've left, or if the notes were shared with them. */
  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailedAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

@Entity('meeting_note_chunks')
export class MeetingNoteChunk {
  @PrimaryColumn('uuid')
  noteId: string;

  @PrimaryColumn('int')
  segment: number;

  @PrimaryColumn('int')
  seq: number;

  @Column('bytea')
  data: Buffer;
}

@Entity('meeting_note_items')
export class MeetingNoteItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  noteId: string;

  @Column('int')
  position: number;

  @Column('text')
  text: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ownerName: string | null;

  @Column({ default: false })
  done: boolean;

  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;
}
