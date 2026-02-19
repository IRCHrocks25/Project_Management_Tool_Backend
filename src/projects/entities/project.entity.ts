import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Task } from '../../tasks/entities/task.entity';
import { Deliverable } from '../../deliverables/entities/deliverable.entity';
import { Email } from '../../emails/entities/email.entity';
import { ProjectTeamMember } from './project-team-member.entity';

export enum ClientType {
  ICON = 'ICON',
  STAR = 'STAR',
  KATALYST = 'Katalyst',
  PRIVATE = 'Private',
}

export enum PackageType {
  STARTER = 'Starter',
  STANDARD = 'Standard',
  PREMIUM = 'Premium',
  ICON_PACKAGE = 'ICON Package',
  CUSTOM = 'Custom',
}

export enum Priority {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
  URGENT = 'Urgent',
}

export enum ProjectStage {
  INTAKE = 'Onboarding',
  COPY = 'Copy',
  COPY_REVISION = 'Copy Revision',
  DESIGN = 'Design',
  DESIGN_REVISION = 'Design Revision',
  DEV = 'Dev',
  AI_TEAM = 'AI Team',
  SOCIAL_MEDIA_TEAM = 'Social Media Team',
  CRM = 'CRM',
  SEO_GEO_TEAM = 'SEO/GEO Team',
  READY_TO_CLOSE = 'Ready to Close',
  CLOSED = 'Closed',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  clientName: string;

  @Column({
    type: 'enum',
    enum: ClientType,
  })
  clientType: ClientType;

  @Column({
    type: 'enum',
    enum: PackageType,
  })
  package: PackageType;

  @Column({
    type: 'enum',
    enum: Priority,
    default: Priority.MEDIUM,
  })
  priority: Priority;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'pmId' })
  pm: User;

  @Column()
  pmId: string;

  @Column()
  targetCloseMonth: string; // Format: "2024-03"

  @Column('text', { nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: ProjectStage,
    default: ProjectStage.INTAKE,
  })
  stage: ProjectStage;

  @Column({ default: 0 })
  copyRevisionCount: number;

  @Column({ default: 0 })
  designRevisionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastEmailedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'archivedByUserId' })
  archivedBy: User;

  @Column({ nullable: true })
  archivedByUserId: string;

  @OneToMany(() => Task, (task) => task.project)
  tasks: Task[];

  @OneToMany(() => Deliverable, (deliverable) => deliverable.project)
  deliverables: Deliverable[];

  @OneToMany(() => Email, (email) => email.project)
  emails: Email[];

  @OneToMany(() => ProjectTeamMember, (member) => member.project)
  teamMembers: ProjectTeamMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

