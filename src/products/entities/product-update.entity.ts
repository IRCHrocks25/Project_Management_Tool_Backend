import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { User } from '../../users/entities/user.entity';
import { ProductUpdateComment } from './product-update-comment.entity';
import { ProductFile } from './product-file.entity';

export enum ProductUpdateType {
  PROGRESS = 'progress',
  RELEASE = 'release',
  HEADS_UP = 'heads_up',
  BLOCKER = 'blocker',
  QUESTION = 'question',
}

/** A post in a product's updates feed. */
@Entity('product_updates')
export class ProductUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ nullable: true })
  authorId: string;

  @Column({ type: 'varchar', length: 20, default: ProductUpdateType.PROGRESS })
  type: ProductUpdateType;

  @Column('text')
  body: string;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ProductUpdateComment, (c) => c.update)
  comments: ProductUpdateComment[];

  @OneToMany(() => ProductFile, (f) => f.update)
  files: ProductFile[];
}
