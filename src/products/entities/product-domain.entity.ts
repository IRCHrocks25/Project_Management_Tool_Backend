import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

/** A domain a product runs on, with renewal and SSL expiry dates (YYYY-MM-DD). */
@Entity('product_domains')
export class ProductDomain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column({ length: 253 })
  domain: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  registrar: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  dnsProvider: string | null;

  @Column({ type: 'date' })
  renewsOn: string;

  @Column({ type: 'date' })
  sslExpiresOn: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
