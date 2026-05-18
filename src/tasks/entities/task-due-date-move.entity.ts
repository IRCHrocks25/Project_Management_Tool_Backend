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

@Entity('task_due_date_moves')
export class TaskDueDateMove {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column({ type: 'date' })
  movedDate: Date;

  @Column('text', { nullable: true })
  comment: string;

  @Column('uuid', { nullable: true })
  movedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'movedById' })
  movedBy: User;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  movedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
