import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductUpdate } from './product-update.entity';

/** A reply to a product update. */
@Entity('product_update_comments')
export class ProductUpdateComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductUpdate, (u) => u.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'updateId' })
  update: ProductUpdate;

  @Column()
  updateId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ nullable: true })
  authorId: string;

  @Column('text')
  body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
