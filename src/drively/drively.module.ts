import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { SharedModule } from '../shared/shared.module';
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
    SharedModule,
    ProductsModule, // HubUsersService: safe user shapes
  ],
  controllers: [DrivelyController],
  providers: [DrivelyService, DrivelyGateway],
  exports: [DrivelyService],
})
export class DrivelyModule {}
