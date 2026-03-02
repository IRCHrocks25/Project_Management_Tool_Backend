import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Task } from '../../tasks/entities/task.entity';

export enum NotificationType {
  TASK_ASSIGNED = 'task',
  TASK_AVAILABLE = 'task_available', // New type for unassigned tasks available to department
  EMAIL_SENT = 'email',
  PROJECT_STAGE_CHANGED = 'project_stage',
  PROJECT_CREATED = 'project_created',
  TASK_COMPLETED = 'task_completed',
  PROJECT_ALERT = 'alert',
  REVISION_REQUESTED = 'revision',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column({ nullable: true })
  projectId: string;

  @ManyToOne(() => Task, { nullable: true })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column({ nullable: true })
  taskId: string;

  @Column({ nullable: true })
  assignedToId: string; // For task notifications - the user assigned to the task

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

