import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskQuestion } from './task-question.entity';
import { User } from '../../users/entities/user.entity';

@Entity('task_comments')
export class TaskComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TaskQuestion)
  @JoinColumn({ name: 'questionId' })
  question: TaskQuestion;

  @Column()
  questionId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'simple-array', nullable: true })
  mentionedUserIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

