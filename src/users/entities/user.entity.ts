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
  RAPID_PROSPECT = 'Rapid Prospect',
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

  @Column({ type: 'boolean', default: false })
  isTeamLead: boolean;

  @Column({ type: 'boolean', default: false })
  isHeadPM: boolean;

  @Column({ type: 'boolean', default: true })
  emailNotificationsEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  resetPasswordToken: string;

  @Column({ nullable: true })
  resetPasswordExpires: Date;

  @Column({ nullable: true })
  otpCode: string;

  @Column({ nullable: true })
  otpExpires: Date;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ type: 'date', nullable: true })
  birthday: string;

  @Column({ type: 'text', nullable: true })
  bio: string;
}
