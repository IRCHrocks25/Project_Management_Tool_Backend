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
import { BoardViewModule } from './board-view/board-view.module';
import { ProductsModule } from './products/products.module';
import { ProductTicketsModule } from './product-tickets/product-tickets.module';
import { ProductSopsModule } from './product-sops/product-sops.module';
import { ProductSearchModule } from './product-search/product-search.module';
import { ProductVaultModule } from './product-vault/product-vault.module';
import { FormsModule } from './forms/forms.module';
import { AssistantModule } from './assistant/assistant.module';

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
    BoardViewModule,
    ProductsModule,
    ProductTicketsModule,
    ProductSopsModule,
    ProductSearchModule,
    ProductVaultModule,
    FormsModule,
    AssistantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
