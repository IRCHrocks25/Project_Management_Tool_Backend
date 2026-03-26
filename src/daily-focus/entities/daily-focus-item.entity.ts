import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';

@Entity('daily_focus_items')
@Index(['focusDate'])
@Unique(['focusDate', 'departmentKey', 'rank'])
@Unique(['focusDate', 'taskId'])
export class DailyFocusItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Calendar day in org timezone (YYYY-MM-DD stored as date) */
  @Column({ type: 'date' })
  focusDate: string;

  /** Matches Task.type enum string, e.g. Copy, Design, Dev */
  @Column()
  departmentKey: string;

  @Column()
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  /** 1..3 within department */
  @Column({ type: 'int' })
  rank: number;

  @Column({ nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
