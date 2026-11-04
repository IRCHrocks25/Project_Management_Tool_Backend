import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { User } from '../../users/entities/user.entity';
import { ProductUpdate } from './product-update.entity';

/** A file stored in Iceberg under `products/<productId>`, optionally attached to an update. */
@Entity('product_files')
export class ProductFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @ManyToOne(() => ProductUpdate, (u) => u.files, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updateId' })
  update: ProductUpdate | null;

  @Column({ type: 'uuid', nullable: true })
  updateId: string | null;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 120, default: 'General' })
  folder: string;

  @Column({ length: 1000 })
  url: string;

  /** Iceberg key, needed to delete the asset. */
  @Column({ length: 1000 })
  storageKey: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contentType: string | null;

  @Column({ type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;

  @Column({ nullable: true })
  uploadedById: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
