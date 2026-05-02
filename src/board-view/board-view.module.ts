import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoardViewController } from './board-view.controller';
import { BoardViewService } from './board-view.service';
import { Project } from '../projects/entities/project.entity';
import { Deliverable } from '../deliverables/entities/deliverable.entity';
import { Task } from '../tasks/entities/task.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Deliverable, Task])],
  controllers: [BoardViewController],
  providers: [BoardViewService],
})
export class BoardViewModule {}
