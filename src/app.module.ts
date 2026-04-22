import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { EmailsModule } from './emails/emails.module';
import { TasksModule } from './tasks/tasks.module';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClientUpdatesModule } from './client-updates/client-updates.module';
import { ChatModule } from './chat/chat.module';
import { TicketsModule } from './tickets/tickets.module';
import { DailyFocusModule } from './daily-focus/daily-focus.module';
import { DepartmentProjectFocusModule } from './department-project-focus/department-project-focus.module';
import { MonthlyRemindersModule } from './monthly-reminders/monthly-reminders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),
    AuthModule,
    ProjectsModule,
    EmailsModule,
    TasksModule,
    DeliverablesModule,
    NotificationsModule,
    ClientUpdatesModule,
    ChatModule,
    TicketsModule,
    DailyFocusModule,
    DepartmentProjectFocusModule,
    MonthlyRemindersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

