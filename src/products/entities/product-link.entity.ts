import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';

export enum ProductLinkKind {
  ENVIRONMENT = 'environment',
  LINK = 'link',
}

/** An environment URL (Production, Staging…) or any other useful link. */
@Entity('product_links')
export class ProductLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column({ type: 'varchar', length: 20, default: ProductLinkKind.LINK })
  kind: ProductLinkKind;

  @Column({ length: 120 })
  label: string;

  @Column({ length: 1000 })
  url: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
