import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

@Entity('monthly_reminders')
@Index(['reminderDay'])
@Index(['projectId'])
export class MonthlyReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @Column()
  clientName: string;

  @Column({ type: 'int' })
  reminderDay: number; // 1..31

  @Column({ type: 'text' })
  note: string;

  @Column({ type: 'text', nullable: true })
  reminderLink: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  currentMonthKey: string | null; // YYYY-MM

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  currentMonthStatus: 'pending' | 'done' | 'no';

  @Column({ type: 'varchar', length: 12, nullable: true })
  nextMonthStatus: 'pending' | 'done' | 'no' | null;

  @Column({ nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @Column({ nullable: true })
  updatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updatedById' })
  updatedBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

