import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductCredential } from './product-credential.entity';

/** A previous password of a company or personal login, kept for 30 days. */
@Entity('product_credential_versions')
export class ProductCredentialVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credentialId' })
  credential: ProductCredential;

  @Column()
  credentialId: string;

  /** Never select into API responses. */
  @Column('text', { select: false })
  secretEncrypted: string;

  /** Who replaced this password. */
  @Column({ type: 'uuid', nullable: true })
  changedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
