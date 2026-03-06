import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Task } from './task.entity';
import { User } from '../../users/entities/user.entity';
import { TaskComment } from './task-comment.entity';

@Entity('task_questions')
export class TaskQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task)
  @JoinColumn({ name: 'taskId' })
  task: Task;

  @Column()
  taskId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'simple-array', nullable: true })
  mentionedUserIds: string[];

  @OneToMany(() => TaskComment, (comment) => comment.question)
  comments: TaskComment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

