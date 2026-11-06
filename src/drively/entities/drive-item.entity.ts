import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DriveKind = 'folder' | 'doc' | 'grid' | 'slides' | 'pdf' | 'file';

@Entity('drive_items')
export class DriveItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  kind: DriveKind;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  preview: unknown;

  @Column({ type: 'int', default: 1 })
  revision: number;

  @Column({ type: 'boolean', default: false })
  hasLiveState: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  assetId: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  storageKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contentType: string | null;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes: string;

  @Column({ type: 'timestamptz', nullable: true })
  trashedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  trashRootId: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
