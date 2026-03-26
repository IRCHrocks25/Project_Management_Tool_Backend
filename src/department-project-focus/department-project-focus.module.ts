import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentProjectFocusItem } from './entities/department-project-focus-item.entity';
import { DepartmentProjectFocusOverrideItem } from './entities/department-project-focus-override.entity';
import { DailyFocusItem } from '../daily-focus/entities/daily-focus-item.entity';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { DepartmentProjectFocusService } from './department-project-focus.service';
import { DepartmentProjectFocusController } from './department-project-focus.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepartmentProjectFocusItem,
      DepartmentProjectFocusOverrideItem,
      DailyFocusItem,
      Task,
      User,
    ]),
  ],
  controllers: [DepartmentProjectFocusController],
  providers: [DepartmentProjectFocusService],
  exports: [DepartmentProjectFocusService],
})
export class DepartmentProjectFocusModule {}
