import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type BoardColumnType = 'text' | 'number' | 'status' | 'date' | 'people' | 'checkbox' | 'link';

export interface BoardColumnLabel {
  label: string;
  color: string;
}

/** A column one project added to its board. Values live in tasks.customFields, keyed by this id. */
@Entity('board_columns')
@Index(['projectId', 'position'])
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: BoardColumnType;

  @Column('jsonb', { default: [] })
  labels: BoardColumnLabel[];

  @Column('int', { default: 0 })
  position: number;

  @Column('uuid', { nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
