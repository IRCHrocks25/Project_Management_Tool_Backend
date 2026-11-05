import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ProductCredential } from './product-credential.entity';

/** A client share link for a vault item. Only the sha256 of the token is stored. */
@Entity('product_credential_shares')
export class ProductCredentialShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credentialId' })
  credential: ProductCredential;

  @Column()
  credentialId: string;

  @Column({ type: 'char', length: 64, unique: true, select: false })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: true })
  oneTime: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  viewedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Works even when the login isn't shareable. Only the assistant creates these. */
  @Column({ type: 'boolean', default: false })
  internal: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
