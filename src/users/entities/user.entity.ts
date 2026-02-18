import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  FOUNDER_CEO = 'FOUNDER/CEO',
  PROJECT_MANAGER = 'Project Manager',
  COPY_WRITING = 'Copy Writing',
  DESIGNER = 'Designer',
  DEVELOPER = 'Developer',
  AI_DEVELOPER = 'AI Developer',
  SOCIAL_MEDIA = 'Social Media',
  CRM = 'CRM',
  SEO_GEO = 'SEO/GEO',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.PROJECT_MANAGER,
  })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

