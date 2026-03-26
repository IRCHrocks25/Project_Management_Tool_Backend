import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('eod_report_snapshots')
@Unique(['reportDate'])
export class EodReportSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  reportDate: string;

  @Column({ type: 'varchar', length: 64 })
  timezone: string;

  @Column({ type: 'jsonb' })
  snapshot: any;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

