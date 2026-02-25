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
import { ClientUpdateForm } from './client-update-form.entity';

export enum UpdateStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  RESPONDED = 'responded',
}

@Entity('client_updates')
export class ClientUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  projectId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'pmId' })
  pm: User;

  @Column()
  pmId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  emailSentAt: Date;

  @Column({
    type: 'enum',
    enum: UpdateStatus,
    default: UpdateStatus.DRAFT,
  })
  status: UpdateStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'simple-array', nullable: true })
  links: string[];

  @OneToMany(() => ClientUpdateForm, (form) => form.update)
  forms: ClientUpdateForm[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

