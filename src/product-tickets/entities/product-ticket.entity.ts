import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

export enum ProductTicketType {
  BUG = 'bug',
  FEATURE = 'feature',
  REQUEST = 'request',
  TASK = 'task',
}

export enum ProductTicketPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum ProductTicketStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
}

/** A Katalyst Hub ticket (unrelated to the legacy `tickets` table). */
@Entity('product_tickets')
@Unique(['productId', 'number'])
export class ProductTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('uuid')
  productId: string;

  @Column({ type: 'int' })
  number: number;

  /** e.g. "CF-12" */
  @Column({ length: 20 })
  key: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 20, default: ProductTicketType.TASK })
  type: ProductTicketType;

  @Column({ type: 'varchar', length: 20, default: ProductTicketPriority.MEDIUM })
  priority: ProductTicketPriority;

  @Column({ type: 'varchar', length: 20, default: ProductTicketStatus.TODO })
  status: ProductTicketStatus;

  @Column({ type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reporterId: string | null;

  @Column('text', { nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
