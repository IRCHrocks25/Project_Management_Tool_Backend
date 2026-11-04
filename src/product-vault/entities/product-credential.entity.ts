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

export enum CredentialEnvironment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEMO = 'demo',
}

/** A login stored in the Katalyst Hub vault. The secret is AES-256-GCM encrypted. */
@Entity('product_credentials')
export class ProductCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column()
  label: string;

  @Column({ type: 'varchar', length: 20, default: CredentialEnvironment.PRODUCTION })
  environment: CredentialEnvironment;

  @Column({ type: 'varchar', nullable: true })
  loginUrl: string | null;

  @Column()
  username: string;

  /** `v1:<iv>:<tag>:<ciphertext>`. Never select into API responses. */
  @Column('text', { select: false })
  secretEncrypted: string;

  @Column({ type: 'boolean', default: false })
  shareable: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy: User;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
