import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { ProductsModule } from '../products/products.module';
import { SharedModule } from '../shared/shared.module';
import { DriveClientGuard, DriveClientPortalController } from './drive-client-portal.controller';
import { DriveClientsService } from './drive-clients.service';
import { DrivelyController } from './drively.controller';
import { DrivelyGateway } from './drively.gateway';
import { DrivelyService } from './drively.service';
import { DriveItemAsset } from './entities/drive-item-asset.entity';
import { DriveItemShare } from './entities/drive-item-share.entity';
import { DriveItem } from './entities/drive-item.entity';

// Drively: folders, Docs, Grid, Slides, PDFs and uploads. Contract: docs/drively.md.
@Module({
  imports: [
    TypeOrmModule.forFeature([DriveItem, DriveItemShare, DriveItemAsset]),
    JwtModule.register({}),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    EmailModule,
    SharedModule,
    ProductsModule, // HubUsersService: safe user shapes
  ],
  controllers: [DrivelyController, DriveClientPortalController],
  providers: [DrivelyService, DrivelyGateway, DriveClientsService, DriveClientGuard],
  exports: [DrivelyService],
})
export class DrivelyModule {}
