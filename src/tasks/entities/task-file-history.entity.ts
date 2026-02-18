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

export enum FileAction {
  APPROVED = 'Approved',
  REVISION_REQUESTED = 'Revision Requested',
  SUBMITTED = 'Submitted',
}

@Entity('task_file_history')
export class TaskFileHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column()
  taskId: string;

  @Column('text')
  fileUrl: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: FileAction,
  })
  action: FileAction;

  @Column('text', { nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}

