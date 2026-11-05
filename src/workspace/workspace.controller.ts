import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Uuid, actorOf } from '../product-vault/product-vault.controller';
import { CreatePageDto, SetPageSharesDto, ToggleChecklistDto, UpdatePageDto } from './dto/workspace.dto';
import { MAX_IMAGE_BYTES, WorkspaceService } from './workspace.service';
import { MyDayService } from './my-day.service';

@Controller('workspace')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(
    private readonly pages: WorkspaceService,
    private readonly myDay: MyDayService,
  ) {}

  @Get('pages')
  list(@Query('view') view: string, @Query('q') q: string, @Request() req: any) {
    return this.pages.list(view, q, actorOf(req));
  }

  @Post('pages')
  create(@Body() dto: CreatePageDto, @Request() req: any) {
    return this.pages.create(dto, actorOf(req));
  }

  @Get('pages/:id')
  get(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.pages.get(id, actorOf(req));
  }

  @Patch('pages/:id')
  update(@Param('id', Uuid) id: string, @Body() dto: UpdatePageDto, @Request() req: any) {
    return this.pages.update(id, dto, actorOf(req));
  }

  @Delete('pages/:id')
  remove(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.pages.remove(id, actorOf(req));
  }

  @Post('pages/:id/duplicate')
  duplicate(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.pages.duplicate(id, actorOf(req));
  }

  @Get('pages/:id/shares')
  shares(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.pages.getShares(id, actorOf(req));
  }

  @Put('pages/:id/shares')
  setShares(@Param('id', Uuid) id: string, @Body() dto: SetPageSharesDto, @Request() req: any) {
    return this.pages.setShares(id, dto, actorOf(req));
  }

  @Patch('pages/:id/checklist')
  checklist(@Param('id', Uuid) id: string, @Body() dto: ToggleChecklistDto, @Request() req: any) {
    return this.pages.toggleChecklist(id, dto, actorOf(req));
  }

  @Post('pages/:id/images')
  @UseInterceptors(FilesInterceptor('files', 1, { limits: { fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(@Param('id', Uuid) id: string, @UploadedFiles() files: Express.Multer.File[], @Request() req: any) {
    return this.pages.uploadImage(id, files, actorOf(req));
  }

  @Get('task-search')
  taskSearch(@Query('q') q: string) {
    return this.pages.searchTasks(q);
  }

  @Get('my-day')
  getMyDay(@Request() req: any) {
    return this.myDay.get(actorOf(req));
  }
}
