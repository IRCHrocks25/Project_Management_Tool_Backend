import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deliverable } from './entities/deliverable.entity';
import { DeliverableTeamMember } from './entities/deliverable-team-member.entity';
import { DeliverableHistory } from './entities/deliverable-history.entity';
import { Task } from '../tasks/entities/task.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesController } from './deliverables.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deliverable, DeliverableTeamMember, DeliverableHistory, Task, Project, User]),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [DeliverablesController],
  providers: [DeliverablesService],
  exports: [DeliverablesService],
})
export class DeliverablesModule {}

