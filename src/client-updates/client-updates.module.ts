import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientUpdatesService } from './client-updates.service';
import { ClientUpdatesController } from './client-updates.controller';
import { ClientUpdate } from './entities/client-update.entity';
import { ClientUpdateForm } from './entities/client-update-form.entity';
import { ClientUpdateFormSubmission } from './entities/client-update-form-submission.entity';
import { ClientUpdateComment } from './entities/client-update-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientUpdate,
      ClientUpdateForm,
      ClientUpdateFormSubmission,
      ClientUpdateComment,
      Project,
      User,
    ]),
  ],
  controllers: [ClientUpdatesController],
  providers: [ClientUpdatesService, CloudinaryService],
  exports: [ClientUpdatesService],
})
export class ClientUpdatesModule {}

