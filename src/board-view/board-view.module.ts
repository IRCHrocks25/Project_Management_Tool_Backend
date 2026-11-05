import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardViewController } from './board-view.controller';
import { BoardViewService } from './board-view.service';
import { Project } from '../projects/entities/project.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { Task } from '../tasks/entities/task.entity';
import { BoardColumn } from '../tasks/entities/board-column.entity';
import { User } from '../users/entities/user.entity';
import { ProjectBoardService } from './project-board.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Deliverable, Task, BoardColumn, User])],
  controllers: [BoardViewController],
  providers: [BoardViewService, ProjectBoardService],
})
export class BoardViewModule {}
