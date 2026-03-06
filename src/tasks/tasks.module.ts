import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskFileHistory } from './entities/task-file-history.entity';
import { TaskQuestion } from './entities/task-question.entity';
import { TaskComment } from './entities/task-comment.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAssignee, TaskFileHistory, TaskQuestion, TaskComment, Deliverable, User]),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

