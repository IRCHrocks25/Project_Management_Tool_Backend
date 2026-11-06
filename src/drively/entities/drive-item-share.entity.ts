import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('drive_item_shares')
export class DriveItemShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  target: string | null;

  @Column({ type: 'varchar', length: 10 })
  permission: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
