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
import { DeliverableTeamMember } from './deliverable-team-member.entity';

export enum DeliverableType {
  LOGO = 'Logo',
  BRAND_BOOK = 'Brand Book',
  LANDING_PAGE = 'Home Page',
  COPY_OF_LANDING_PAGE = 'Copy of Home Page',
  SPEAKER_KIT = 'Speaker Kit',
  SOCIAL_BANNERS = 'Social Banners',
  OTHER = 'Other',
}

export enum DeliverableStatus {
  NOT_STARTED = 'Not Started',
  IN_PROGRESS = 'In Progress',
  READY_FOR_REVIEW = 'Ready for Review',
  CLIENT_REVIEW = 'Client Review',
  APPROVED = 'Approved',
  REVISION = 'Revision',
}

@Entity('deliverables')
export class Deliverable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: DeliverableType,
  })
  type: DeliverableType;

  @Column('text', { nullable: true })
  customType: string; // For custom deliverable names

  @ManyToOne(() => Project, (project) => project.deliverables)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: string;

  @Column({
    type: 'enum',
    enum: DeliverableStatus,
    default: DeliverableStatus.NOT_STARTED,
  })
  status: DeliverableStatus;

  @Column('text', { nullable: true })
  notes: string;

  @Column('text', { nullable: true })
  fileUrl: string;

  @OneToMany(() => DeliverableTeamMember, (member) => member.deliverable)
  teamMembers: DeliverableTeamMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
