import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientUpdateForm } from './client-update-form.entity';

export interface SubmissionResponse {
  blockId: string;
  type: string;
  text?: string;
  imageUrls?: string[]; // Array of Cloudinary URLs
}

@Entity('client_update_form_submissions')
export class ClientUpdateFormSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClientUpdateForm, (form) => form.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formId' })
  form: ClientUpdateForm;

  @Column()
  formId: string;

  @Column('jsonb')
  responses: SubmissionResponse[]; // Array of responses matching form blocks

  @Column({ nullable: true })
  clientName: string; // Optional: client can provide their name

  @Column({ nullable: true })
  clientEmail: string; // Optional: client can provide their email

  @CreateDateColumn()
  submittedAt: Date;
}

