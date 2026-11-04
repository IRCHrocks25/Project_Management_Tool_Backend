import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { ProductSopStep } from './product-sop-step.entity';

@Entity('product_sops')
export class ProductSop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('uuid')
  productId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  audience: string | null;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @OneToMany(() => ProductSopStep, (step) => step.sop)
  steps: ProductSopStep[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
