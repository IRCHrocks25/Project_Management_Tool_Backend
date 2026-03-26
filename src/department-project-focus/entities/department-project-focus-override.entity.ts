import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Task } from '../../tasks/entities/task.entity';
import { User } from '../../users/entities/user.entity';

/** Extra focus clients a department team lead adds on top of PM-set priorities (same day + departmentKey). */
@Entity('department_project_focus_override_items')
@Index(['focusDate', 'departmentKey'])
@Unique(['focusDate', 'departmentKey', 'taskId'])
export class DepartmentProjectFocusOverrideItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date' })
  focusDate: string;

  @Column()
  departmentKey: string;

  @Column({ nullable: true })
  taskId: string | null;

  @ManyToOne(() => Task, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: Task | null;

  @Column({ nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
