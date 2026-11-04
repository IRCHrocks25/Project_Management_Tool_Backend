import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum ProductStatus {
  LIVE = 'live',
  BETA = 'beta',
  BUILDING = 'building',
  PAUSED = 'paused',
}

/** An internal product tracked in the Katalyst Hub (CourseForge, Iceberg, …). */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  /** Ticket key prefix, e.g. "CF" for CF-101. */
  @Column({ unique: true, length: 8 })
  code: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 20, default: ProductStatus.BUILDING })
  status: ProductStatus;

  @Column({ nullable: true })
  version: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column({ nullable: true })
  ownerId: string;

  /** Last ticket number handed out; incremented atomically when a ticket is created. */
  @Column({ type: 'int', default: 0 })
  ticketSeq: number;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ nullable: true })
  createdById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
