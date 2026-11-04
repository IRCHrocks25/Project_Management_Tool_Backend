import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { FormItem, FormSettings } from '../forms.types';

export enum FormStatus {
  DRAFT = 'draft', // never published, no public link yet
  OPEN = 'open', // accepting responses
  CLOSED = 'closed', // link shows "this form is closed"
}

/** A Google-Forms-style form. Templates are forms with `isTemplate`, copied when a form is made from them. */
@Entity('forms')
export class Form {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner: User | null;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ default: false })
  isTemplate: boolean;

  @Column({ type: 'varchar', length: 20, default: FormStatus.DRAFT })
  status: FormStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items: FormItem[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: Partial<FormSettings>;

  /** The credential for the public link; set on first publish, replaced by "regenerate link". */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  publicToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
