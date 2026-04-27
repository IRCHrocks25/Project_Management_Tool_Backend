import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyFocusItem } from './entities/daily-focus-item.entity';
import { EodReportSnapshot } from './entities/eod-report-snapshot.entity';
import { DepartmentProjectFocusItem } from '../department-project-focus/entities/department-project-focus-item.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskQuestion } from '../tasks/entities/task-question.entity';
import { DailyFocusService } from './daily-focus.service';
import { DailyFocusController } from './daily-focus.controller';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyFocusItem,
      EodReportSnapshot,
      DepartmentProjectFocusItem,
      Task,
      TaskQuestion,
    ]),
  ],
  controllers: [DailyFocusController, ReportsController],
  providers: [DailyFocusService],
  exports: [DailyFocusService],
})
export class DailyFocusModule {}
