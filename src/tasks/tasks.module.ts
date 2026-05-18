import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AttachmentsService } from './attachments.service';
import { TransfersService } from './transfers.service';
import { Task } from './entities/task.entity';
import { TaskAssignee } from './entities/task-assignee.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskFileHistory } from './entities/task-file-history.entity';
import { TaskQuestion } from './entities/task-question.entity';
import { TaskComment } from './entities/task-comment.entity';
import { TaskTransfer } from './entities/task-transfer.entity';
import { TaskDueDateMove } from './entities/task-due-date-move.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskAssignee,
      TaskAttachment,
      TaskFileHistory,
      TaskQuestion,
      TaskComment,
      TaskTransfer,
      TaskDueDateMove,
      Deliverable,
      User,
    ]),
    forwardRef(() => NotificationsModule),
    SharedModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, AttachmentsService, TransfersService],
  exports: [TasksService, AttachmentsService, TransfersService],
})
export class TasksModule {}
