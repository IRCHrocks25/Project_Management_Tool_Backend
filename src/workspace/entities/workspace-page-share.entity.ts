import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type PageShareKind = 'everyone' | 'department' | 'user';

@Entity('workspace_page_shares')
export class WorkspacePageShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  pageId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: PageShareKind;

  /** Null for everyone, a UserRole value for department, a user id for user. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  target: string | null;

  @Column({ type: 'varchar', length: 10 })
  permission: 'view' | 'edit';

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
