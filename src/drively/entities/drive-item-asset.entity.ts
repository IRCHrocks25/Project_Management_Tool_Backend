import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('drive_item_assets')
export class DriveItemAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'varchar', length: 100 })
  assetId: string;

  @Column({ type: 'varchar', length: 1000 })
  storageKey: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contentType: string | null;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
