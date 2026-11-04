import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { ProductSopStep } from './product-sop-step.entity';

/** One row per (step, user) the user has ticked off. */
@Entity('product_sop_progress')
@Unique(['stepId', 'userId'])
export class ProductSopProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductSopStep, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stepId' })
  step: ProductSopStep;

  @Column('uuid')
  stepId: string;

  @Column('uuid')
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
