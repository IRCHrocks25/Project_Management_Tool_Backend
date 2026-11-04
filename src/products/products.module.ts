import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductMember } from './entities/product-member.entity';
import { ProductLink } from './entities/product-link.entity';
import { ProductDomain } from './entities/product-domain.entity';
import { ProductUpdate } from './entities/product-update.entity';
import { ProductUpdateComment } from './entities/product-update-comment.entity';
import { ProductFile } from './entities/product-file.entity';
import { User } from '../users/entities/user.entity';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductUpdatesService } from './product-updates.service';
import { ProductFilesService } from './product-files.service';
import { HubUsersService } from './hub-users.service';

// Katalyst Hub core: products, team, links, domains, updates, files.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductMember,
      ProductLink,
      ProductDomain,
      ProductUpdate,
      ProductUpdateComment,
      ProductFile,
      User,
    ]),
    SharedModule,
    NotificationsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductUpdatesService, ProductFilesService, HubUsersService],
  exports: [TypeOrmModule, ProductsService, ProductFilesService, HubUsersService],
})
export class ProductsModule {}
