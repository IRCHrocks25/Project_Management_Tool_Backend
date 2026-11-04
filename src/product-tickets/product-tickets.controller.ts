import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductIdPipe, uuidOr404 } from './uuid-or-404.pipe';
import { ProductTicketsService } from './product-tickets.service';
import {
  CreateProductTicketDto,
  ListProductTicketsQueryDto,
  UpdateProductTicketDto,
} from './dto/product-ticket.dto';

const TicketIdPipe = uuidOr404('Ticket not found.');

@Controller('products/:id/tickets')
@UseGuards(JwtAuthGuard)
export class ProductTicketsController {
  constructor(private readonly ticketsService: ProductTicketsService) {}

  @Get()
  list(@Param('id', ProductIdPipe) productId: string, @Query() query: ListProductTicketsQueryDto) {
    return this.ticketsService.list(productId, query);
  }

  @Post()
  create(
    @Param('id', ProductIdPipe) productId: string,
    @Body() dto: CreateProductTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.create(productId, dto, req.user.userId);
  }

  @Get(':ticketId')
  findOne(
    @Param('id', ProductIdPipe) productId: string,
    @Param('ticketId', TicketIdPipe) ticketId: string,
  ) {
    return this.ticketsService.findOne(productId, ticketId);
  }

  @Patch(':ticketId')
  update(
    @Param('id', ProductIdPipe) productId: string,
    @Param('ticketId', TicketIdPipe) ticketId: string,
    @Body() dto: UpdateProductTicketDto,
    @Request() req: any,
  ) {
    return this.ticketsService.update(productId, ticketId, dto, req.user.userId);
  }

  @Delete(':ticketId')
  remove(
    @Param('id', ProductIdPipe) productId: string,
    @Param('ticketId', TicketIdPipe) ticketId: string,
  ) {
    return this.ticketsService.remove(productId, ticketId);
  }
}
