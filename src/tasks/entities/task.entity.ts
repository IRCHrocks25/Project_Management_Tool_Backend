import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';

export enum TaskStatus {
  TODO = 'Todo',
  IN_PROGRESS = 'In Progress',
  IN_REVIEW = 'In Review',
  COMPLETED = 'Completed',
  BLOCKED = 'Blocked',
}

export enum TaskType {
  INTAKE = 'Onboarding',
  COPY = 'Copy',
  DESIGN = 'Design',
  DEV = 'Dev',
  AI = 'AI',
  SOCIAL_MEDIA = 'Social Media',
  CRM = 'CRM',
  SEO_GEO = 'SEO/GEO',
  GENERAL = 'General',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @ManyToOne(() => Project, (project) => project.tasks)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Column({ nullable: true })
  assignedToId: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskType,
  })
  type: TaskType;

  @Column({ type: 'date', nullable: true })
  dueDate: Date;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ default: false })
  isArchived: boolean;

  @Column('text', { nullable: true })
  fileUrl: string; // Google Drive link or file URL

  @Column('text', { nullable: true })
  submissionData: string; // URL or text submission for onboarding tasks

  @Column('text', { nullable: true })
  submissionType: string; // 'url' or 'text'

  @Column({ nullable: true })
  deliverableId: string; // Link task to a specific deliverable

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

