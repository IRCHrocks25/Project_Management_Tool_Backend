import { Module } from '@nestjs/common';
import { ProductSearchService } from './product-search.service';
import { ProductSearchController } from './product-search.controller';

// Katalyst Hub: search across products, tickets, SOPs, updates and credentials.
// Uses raw SQL through the default DataSource, so no repositories are needed.
@Module({
  controllers: [ProductSearchController],
  providers: [ProductSearchService],
})
export class ProductSearchModule {}
