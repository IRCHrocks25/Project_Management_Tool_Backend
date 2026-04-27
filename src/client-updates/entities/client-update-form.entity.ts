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
import { ClientUpdate } from './client-update.entity';
import { ClientUpdateFormSubmission } from './client-update-form-submission.entity';

export enum FormBlockType {
  PARAGRAPH = 'paragraph',
  HEADING = 'heading',
  IMAGE = 'image',
  TEXT_WITH_IMAGE = 'text_with_image',
  LAYOUT = 'layout',
}

export interface FormBlock {
  id: string;
  type: FormBlockType;
  content?: string; // For paragraph, heading
  imageUrl?: string; // For image, text_with_image
  imageAlt?: string;
  text?: string; // For text_with_image
  layout?: {
    columns: number;
    blocks: FormBlock[];
  }; // For layout block
  bold?: boolean; // For paragraph formatting
}

@Entity('client_update_forms')
export class ClientUpdateForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientUpdate, (update) => update.forms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'updateId' })
  update: ClientUpdate;

  @Column()
  updateId: string;

  @Column({ unique: true })
  publicToken: string; // Unguessable token for shareable URL

  @Column({ default: false })
  isPublished: boolean; // URL only active when published

  @Column('jsonb')
  blocks: FormBlock[]; // Array of form blocks

  @OneToMany(() => ClientUpdateFormSubmission, (submission) => submission.form)
  submissions: ClientUpdateFormSubmission[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
