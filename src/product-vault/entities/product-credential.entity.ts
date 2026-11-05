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

export enum CredentialScope {
  PRODUCT = 'product',
  COMPANY = 'company',
  PERSONAL = 'personal',
}

/** A login stored in the Katalyst Hub vault. The secret is AES-256-GCM encrypted. */
@Entity('product_credentials')
export class ProductCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  /** Set for scope `product`, always null for `company` and `personal` (enforced by a CHECK constraint). */
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'varchar', length: 20, default: CredentialScope.PRODUCT })
  scope: CredentialScope;

  /** Creator of a company or personal item. */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'ownerId' })
  owner: User | null;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

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

  /** Same format as the secret. Never select into API responses without decrypting for someone with access. */
  @Column('text', { select: false, nullable: true })
  notesEncrypted: string | null;

  @Column({ type: 'boolean', default: false })
  shareable: boolean;

  @Column({ type: 'boolean', default: false })
  accessEveryone: boolean;

  @Column('text', { array: true, default: '{}' })
  accessDepartments: string[];

  @Column('uuid', { array: true, default: '{}' })
  accessUserIds: string[];

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  passwordChangedById: string | null;

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
