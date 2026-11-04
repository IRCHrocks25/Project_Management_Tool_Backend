import { Column, CreateDateColumn, Entity, Generated, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('assistant_conversations')
export class AssistantConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 200, default: 'New chat' })
  title: string;

  @Column({ type: 'jsonb', nullable: true })
  pendingState: PendingState | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('assistant_messages')
export class AssistantMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  conversationId: string;

  @Column({ type: 'varchar', length: 20 })
  role: 'user' | 'assistant';

  @Column({ type: 'jsonb' })
  content: any;

  @Column({ type: 'text', nullable: true })
  displayText: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'bigint' })
  @Generated('increment')
  seq: string;
}

@Entity('assistant_memories')
export class AssistantMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('text')
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('assistant_files')
export class AssistantFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column('int')
  size: number;

  // Never loaded unless a query asks for it, so listings stay light
  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

export interface PendingAction {
  toolUseId: string;
  name: string;
  input: any;
  summary: string;
}

export interface PendingState {
  /** tool_result blocks already produced for this assistant turn */
  results: any[];
  actions: PendingAction[];
}
