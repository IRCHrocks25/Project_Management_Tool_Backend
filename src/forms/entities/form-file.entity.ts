import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Form } from './form.entity';
import { FormResponse } from './form-response.entity';

export enum FormFileSource {
  BUILDER = 'builder', // images the team places in the form
  RESPONDENT = 'respondent', // files a client uploads while answering
}

/**
 * A file stored in Iceberg under `forms/<formId>`. Copies of a form (templates,
 * duplicates) get their own rows pointing at the same storage key, so an asset
 * is deleted from Iceberg only when its last row goes.
 */
@Entity('form_files')
export class FormFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Form, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formId' })
  form: Form;

  @Column({ type: 'uuid' })
  formId: string;

  @ManyToOne(() => FormResponse, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'responseId' })
  response: FormResponse | null;

  @Column({ type: 'uuid', nullable: true })
  responseId: string | null;

  @Column({ type: 'varchar', length: 20 })
  source: FormFileSource;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 1000 })
  url: string;

  @Column({ length: 1000 })
  storageKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contentType: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
