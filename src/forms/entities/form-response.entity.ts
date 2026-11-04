import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Form } from './form.entity';
import { FormAnswer } from '../forms.types';

/** One submission of a form. Answers carry a snapshot of each question's title. */
@Entity('form_responses')
export class FormResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Form, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formId' })
  form: Form;

  @Column({ type: 'uuid' })
  formId: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  answers: FormAnswer[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  respondentName: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  respondentEmail: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt: Date;
}
