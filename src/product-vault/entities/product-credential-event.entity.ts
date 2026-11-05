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

export enum CredentialEventAction {
  CREATED = 'created',
  EDITED = 'edited',
  REVEALED = 'revealed',
  COPIED = 'copied',
  SHARED = 'shared',
  SHARE_VIEWED = 'share_viewed',
  SHARE_REVOKED = 'share_revoked',
  RESTORED = 'restored',
  VERSION_REVEALED = 'version_revealed',
}

/** Audit trail for a vault item. `userId` null = a client opened it through a share link. */
@Entity('product_credential_events')
export class ProductCredentialEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductCredential, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'credentialId' })
  credential: ProductCredential;

  @Column()
  credentialId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 20 })
  action: CredentialEventAction;

  @Column({ type: 'varchar', nullable: true })
  detail: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
