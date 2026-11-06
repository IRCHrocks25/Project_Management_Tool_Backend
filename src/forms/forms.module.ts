import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { Form } from './entities/form.entity';
import { FormResponse } from './entities/form-response.entity';
import { FormFile } from './entities/form-file.entity';
import { Project } from '../projects/entities/project.entity';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { FormsController, PublicFormsController } from './forms.controller';
import { FormsService } from './forms.service';

// Forms: Google-Forms-style forms for clients, with files stored in Iceberg.
@Module({
  imports: [
    TypeOrmModule.forFeature([Form, FormResponse, FormFile, Project]),
    // Limits are set per route on PublicFormsController; this is the fallback.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    SharedModule,
    NotificationsModule,
    ProductsModule, // HubUsersService: safe user shapes
  ],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
