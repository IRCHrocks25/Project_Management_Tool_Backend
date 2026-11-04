import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductIdPipe, uuidOr404 } from '../product-tickets/uuid-or-404.pipe';
import { ProductSopsService } from './product-sops.service';
import {
  CreateProductSopDto,
  CreateSopStepDto,
  SetSopStepProgressDto,
  UpdateProductSopDto,
} from './dto/product-sop.dto';

const SopIdPipe = uuidOr404('SOP not found.');
const StepIdPipe = uuidOr404('Step not found.');

@Controller('products/:id/sops')
@UseGuards(JwtAuthGuard)
export class ProductSopsController {
  constructor(private readonly sopsService: ProductSopsService) {}

  @Get()
  list(@Param('id', ProductIdPipe) productId: string, @Request() req: any) {
    return this.sopsService.list(productId, req.user.userId);
  }

  @Post()
  create(
    @Param('id', ProductIdPipe) productId: string,
    @Body() dto: CreateProductSopDto,
    @Request() req: any,
  ) {
    return this.sopsService.create(productId, dto, req.user.userId);
  }

  @Get(':sopId')
  findOne(
    @Param('id', ProductIdPipe) productId: string,
    @Param('sopId', SopIdPipe) sopId: string,
    @Request() req: any,
  ) {
    return this.sopsService.findOne(productId, sopId, req.user.userId);
  }

  @Patch(':sopId')
  update(
    @Param('id', ProductIdPipe) productId: string,
    @Param('sopId', SopIdPipe) sopId: string,
    @Body() dto: UpdateProductSopDto,
    @Request() req: any,
  ) {
    return this.sopsService.update(productId, sopId, dto, req.user.userId);
  }

  @Delete(':sopId')
  remove(@Param('id', ProductIdPipe) productId: string, @Param('sopId', SopIdPipe) sopId: string) {
    return this.sopsService.remove(productId, sopId);
  }

  @Post(':sopId/steps')
  appendStep(
    @Param('id', ProductIdPipe) productId: string,
    @Param('sopId', SopIdPipe) sopId: string,
    @Body() dto: CreateSopStepDto,
    @Request() req: any,
  ) {
    return this.sopsService.appendStep(productId, sopId, dto, req.user.userId);
  }

  @Put(':sopId/steps/:stepId/progress')
  setProgress(
    @Param('id', ProductIdPipe) productId: string,
    @Param('sopId', SopIdPipe) sopId: string,
    @Param('stepId', StepIdPipe) stepId: string,
    @Body() dto: SetSopStepProgressDto,
    @Request() req: any,
  ) {
    return this.sopsService.setProgress(productId, sopId, stepId, dto, req.user.userId);
  }
}
