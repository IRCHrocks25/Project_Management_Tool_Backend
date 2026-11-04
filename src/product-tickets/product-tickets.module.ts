import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductTicket } from './entities/product-ticket.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductTicketsService } from './product-tickets.service';
import { ProductTicketsController } from './product-tickets.controller';

// Katalyst Hub: tickets.
@Module({
  imports: [TypeOrmModule.forFeature([ProductTicket, Product, User]), NotificationsModule],
  controllers: [ProductTicketsController],
  providers: [ProductTicketsService],
  exports: [ProductTicketsService],
})
export class ProductTicketsModule {}
