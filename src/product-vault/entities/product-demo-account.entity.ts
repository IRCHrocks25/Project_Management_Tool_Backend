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
import { Product } from '../../products/entities/product.entity';
import { ProductCredential } from './product-credential.entity';

export enum DemoAssetStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  NOT_NEEDED = 'not_needed',
}

/** A demo login set up for a prospect or client. */
@Entity('product_demo_accounts')
export class ProductDemoAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column()
  clientName: string;

  @Column()
  loginEmail: string;

  @Column('text', { nullable: true })
  purpose: string | null;

  @ManyToOne(() => ProductCredential, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'credentialId' })
  credential: ProductCredential | null;

  @Column({ type: 'uuid', nullable: true })
  credentialId: string | null;

  @Column({ type: 'varchar', length: 20, default: DemoAssetStatus.NOT_STARTED })
  avatarStatus: DemoAssetStatus;

  @Column({ type: 'varchar', length: 20, default: DemoAssetStatus.NOT_STARTED })
  transcriptStatus: DemoAssetStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User | null;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
