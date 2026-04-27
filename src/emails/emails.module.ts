import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailsService } from './emails.service';
import { EmailsController } from './emails.controller';
import { Email } from './entities/email.entity';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    ProjectsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
