import 'multer';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDriveItemDto, SetDriveSharesDto, StarDriveItemDto, UpdateDriveItemDto } from './dto/drively.dto';
import { DriveView, DrivelyService, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from './drively.service';

const ItemId = () =>
  Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('File not found.') }));
const actor = (req: any) => ({ userId: req.user?.userId || req.user?.id, role: req.user?.role });

@Controller('drively')
@UseGuards(JwtAuthGuard)
export class DrivelyController {
  constructor(private readonly drive: DrivelyService) {}

  @Get('items')
  list(
    @Query('view') view: DriveView | undefined,
    @Query('parentId') parentId: string | undefined,
    @Query('q') q: string | undefined,
    @Request() req: any,
  ) {
    return this.drive.list(view || 'mine', parentId, q, actor(req));
  }

  @Get('storage')
  storage(@Request() req: any) {
    return this.drive.storage(actor(req));
  }

  @Post('items')
  create(@Body() dto: CreateDriveItemDto, @Request() req: any) {
    return this.drive.create(dto, actor(req));
  }

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 20, { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('parentId') parentId: string | undefined,
    @Request() req: any,
  ) {
    return this.drive.upload(files, parentId || null, actor(req));
  }

  @Get('items/:id')
  get(@ItemId() id: string, @Request() req: any) {
    return this.drive.get(id, actor(req));
  }

  @Patch('items/:id')
  update(@ItemId() id: string, @Body() dto: UpdateDriveItemDto, @Request() req: any) {
    return this.drive.update(id, dto, actor(req));
  }

  @Post('items/:id/replace')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  replace(
    @ItemId() id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('revision') revision: string,
    @Request() req: any,
  ) {
    return this.drive.replace(id, file, Number(revision), actor(req));
  }

  @Get('items/:id/link')
  link(@ItemId() id: string, @Request() req: any) {
    return this.drive.link(id, actor(req));
  }

  @Post('items/:id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  addImage(@ItemId() id: string, @UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.drive.addImage(id, file, actor(req));
  }

  @Post('items/:id/duplicate')
  duplicate(@ItemId() id: string, @Request() req: any) {
    return this.drive.duplicate(id, actor(req));
  }

  @Post('items/:id/star')
  @HttpCode(200)
  star(@ItemId() id: string, @Body() dto: StarDriveItemDto, @Request() req: any) {
    return this.drive.star(id, dto.starred, actor(req));
  }

  @Post('items/:id/trash')
  @HttpCode(200)
  trash(@ItemId() id: string, @Request() req: any) {
    return this.drive.trash(id, actor(req));
  }

  @Post('items/:id/restore')
  @HttpCode(200)
  restore(@ItemId() id: string, @Request() req: any) {
    return this.drive.restore(id, actor(req));
  }

  @Delete('items/:id')
  remove(@ItemId() id: string, @Request() req: any) {
    return this.drive.remove(id, actor(req));
  }

  @Get('items/:id/shares')
  shares(@ItemId() id: string, @Request() req: any) {
    return this.drive.getShares(id, actor(req));
  }

  @Put('items/:id/shares')
  setShares(@ItemId() id: string, @Body() dto: SetDriveSharesDto, @Request() req: any) {
    return this.drive.setShares(id, dto, actor(req));
  }
}
