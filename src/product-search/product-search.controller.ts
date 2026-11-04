import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductSearchService } from './product-search.service';

@Controller('product-search')
@UseGuards(JwtAuthGuard)
export class ProductSearchController {
  constructor(private readonly searchService: ProductSearchService) {}

  /** GET /product-search?q= — fewer than 2 characters returns []. */
  @Get()
  search(@Query('q') q?: string) {
    return this.searchService.search(typeof q === 'string' ? q : '');
  }
}
