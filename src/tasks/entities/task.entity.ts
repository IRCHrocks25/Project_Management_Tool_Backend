import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { User } from '../../users/entities/user.entity';
import { TaskAssignee } from './task-assignee.entity';

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
  assignedToId: string; // Kept for backward compatibility

  @OneToMany(() => TaskAssignee, (taskAssignee) => taskAssignee.task)
  assignees: TaskAssignee[];

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

  // @deprecated — backfilled into task_attachments; do not write new values here.
  // Column is retained until a confirmed removal pass; see risk register.
  @Column('text', { nullable: true })
  fileUrl: string;

  @Column('text', { nullable: true })
  submissionData: string; // URL or text submission for onboarding tasks

  @Column('text', { nullable: true })
  submissionType: string; // 'url' or 'text'

  @Column({ nullable: true })
  deliverableId: string; // Link task to a specific deliverable

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
