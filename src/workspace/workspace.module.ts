import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyFocusModule } from '../daily-focus/daily-focus.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { SharedModule } from '../shared/shared.module';
import { User } from '../users/entities/user.entity';
import { WorkspacePageShare } from './entities/workspace-page-share.entity';
import { WorkspacePage } from './entities/workspace-page.entity';
import { MyDayService } from './my-day.service';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';

// Workspace: Pages and My Day. The company and personal vault lives in ProductVaultModule.
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspacePage, WorkspacePageShare, User]),
    SharedModule,
    NotificationsModule,
    ProductsModule, // HubUsersService: safe user shapes
    DailyFocusModule, // today's date in ORG_TIMEZONE
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, MyDayService],
})
export class WorkspaceModule {}
