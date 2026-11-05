import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TaskActivityAction =
  | 'description_edited'
  | 'title_changed'
  | 'due_date_changed'
  | 'start_date_changed'
  | 'priority_changed'
  | 'notes_changed'
  | 'group_changed'
  | 'field_changed'
  | 'owners_changed'
  | 'task_created'
  | 'attachment_removed'
  | 'question_deleted'
  | 'task_deleted'
  | 'deliverable_deleted';

@Entity('task_activity_logs')
@Index(['taskId', 'createdAt'])
@Index(['projectId', 'createdAt'])
export class TaskActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No relations to Task, Project or User on purpose: the record must outlive them.
  @Column('uuid', { nullable: true })
  taskId: string | null;

  @Column('uuid', { nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 50 })
  action: TaskActivityAction;

  @Column('uuid', { nullable: true })
  actorId: string | null;

  @Column('text', { nullable: true })
  actorName: string | null;

  @Column('jsonb', { default: {} })
  details: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
