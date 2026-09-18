import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../users/entities/user.entity';

export type TaskAttachmentKind = 'file' | 'link';

@Entity('task_attachments')
export class TaskAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column('text')
  url: string;

  // 'file' = direct upload to Iceberg; 'link' = external URL (Google Drive, Figma, Loom, etc.)
  @Column({ type: 'varchar', length: 16, default: 'file' })
  kind: TaskAttachmentKind;

  @Column('text', { nullable: true })
  filename: string;

  @Column('text', { nullable: true })
  mimeType: string;

  @Column('bigint', { nullable: true })
  sizeBytes: number;

  // Opaque Iceberg asset id; the delivery URL is <cdn>/a/<id>
  @Column('text', { nullable: true })
  icebergAssetId: string;

  // Tenant-relative key — the only identifier Iceberg's delete accepts
  @Column('text', { nullable: true })
  icebergKey: string;

  // Retained for rows uploaded before the Iceberg migration. The Cloudinary
  // account is disabled, so these are dead references kept only for audit.
  @Column('text', { nullable: true })
  cloudinaryPublicId: string;

  @Column('text', { nullable: true })
  cloudinaryResourceType: string;

  @Column({ nullable: true })
  uploadedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;

  @Column('text', { nullable: true })
  note: string;

  // Actual upload time; backfill rows use task.createdAt as best-effort approximation
  @Column({ type: 'timestamptz' })
  uploadedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
