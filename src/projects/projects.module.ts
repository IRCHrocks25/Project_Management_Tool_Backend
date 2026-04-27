import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { Project } from './entities/project.entity';
import { ProjectTeamMember } from './entities/project-team-member.entity';
import { Task } from '../tasks/entities/task.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { DeliverableHistory } from '../deliverables/entities/deliverable-history.entity';
import { TaskFileHistory } from '../tasks/entities/task-file-history.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { WebhookGuard } from './guards/webhook.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectTeamMember,
      Task,
      Deliverable,
      DeliverableHistory,
      TaskFileHistory,
      User,
    ]),
    forwardRef(() => NotificationsModule),
    AuthModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, WebhookGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
