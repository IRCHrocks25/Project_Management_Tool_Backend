import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductSop } from './entities/product-sop.entity';
import { ProductSopStep } from './entities/product-sop-step.entity';
import { ProductSopProgress } from './entities/product-sop-progress.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductSopsService } from './product-sops.service';
import { ProductSopsController } from './product-sops.controller';

// Katalyst Hub: SOPs.
@Module({
  imports: [
    TypeOrmModule.forFeature([ProductSop, ProductSopStep, ProductSopProgress, Product, User]),
    NotificationsModule,
  ],
  controllers: [ProductSopsController],
  providers: [ProductSopsService],
  exports: [ProductSopsService],
})
export class ProductSopsModule {}
