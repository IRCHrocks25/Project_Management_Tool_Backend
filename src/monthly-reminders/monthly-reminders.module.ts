import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyReminder } from './entities/monthly-reminder.entity';
import { MonthlyRemindersService } from './monthly-reminders.service';
import { MonthlyRemindersController } from './monthly-reminders.controller';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MonthlyReminder, User, Project])],
  providers: [MonthlyRemindersService],
  controllers: [MonthlyRemindersController],
  exports: [MonthlyRemindersService],
})
export class MonthlyRemindersModule {}
