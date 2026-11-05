import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** A TipTap document. `contentText` and the checklist counts are derived from `content` on every write. */
@Entity('workspace_pages')
export class WorkspacePage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'varchar', length: 200, default: 'Untitled' })
  title: string;

  @Column('jsonb')
  content: any;

  @Column('text', { default: '' })
  contentText: string;

  @Column({ type: 'int', default: 0 })
  checklistDone: number;

  @Column({ type: 'int', default: 0 })
  checklistTotal: number;

  /** Guards against overlapping saves. */
  @Column({ type: 'int', default: 1 })
  revision: number;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
