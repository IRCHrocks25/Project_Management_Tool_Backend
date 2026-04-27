import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../users/entities/user.entity';

export type TaskTransferKind = 'forward' | 'return';

@Entity('task_transfers')
export class TaskTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column('text')
  fromDepartment: string;

  @Column('text')
  toDepartment: string;

  @Column('jsonb', { default: [] })
  fromAssigneeIds: string[];

  @Column('jsonb', { default: [] })
  toAssigneeIds: string[];

  @Column('uuid', { nullable: true })
  transferredById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transferredById' })
  transferredBy: User;

  @Column({ type: 'varchar', length: 16 })
  kind: TaskTransferKind;

  @Column('text', { nullable: true })
  note: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  transferredAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
