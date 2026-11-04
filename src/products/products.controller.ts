import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductsService } from './products.service';
import { ProductUpdatesService } from './product-updates.service';
import { MAX_PRODUCT_FILE_BYTES, MAX_PRODUCT_FILES_PER_REQUEST, ProductFilesService } from './product-files.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto';
import { CreateDomainDto, UpdateDomainDto } from './dto/domain.dto';
import { CreateCommentDto, CreateUpdateDto, EditUpdateDto, UploadFilesDto } from './dto/update.dto';

/** A malformed id can't match anything, so answer 404 rather than a generic 400. */
const uuid = (what: string) => new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException(`${what} not found.`) });
const ProductId = () => Param('id', uuid('Product'));

const filesInterceptor = () =>
  FilesInterceptor('files', MAX_PRODUCT_FILES_PER_REQUEST, { limits: { fileSize: MAX_PRODUCT_FILE_BYTES } });

const actor = (req: any): string => req.user?.userId || req.user?.id;

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly updates: ProductUpdatesService,
    private readonly files: ProductFilesService,
  ) {}

  // ---- products

  @Get()
  list(@Query('archived') archived?: string) {
    if (archived !== undefined && archived !== 'true' && archived !== 'false') {
      throw new BadRequestException('archived must be true or false.');
    }
    return this.products.list(archived === 'true');
  }

  @Post()
  create(@Body() dto: CreateProductDto, @Request() req: any) {
    return this.products.create(dto, actor(req));
  }

  @Get('by-slug/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.products.getBySlug(slug);
  }

  @Patch(':id')
  update(@ProductId() id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post(':id/archive')
  archive(@ProductId() id: string) {
    return this.products.setArchived(id, true);
  }

  @Post(':id/restore')
  restore(@ProductId() id: string) {
    return this.products.setArchived(id, false);
  }

  // ---- members

  @Post(':id/members')
  addMember(@ProductId() id: string, @Body() dto: CreateMemberDto, @Request() req: any) {
    return this.products.addMember(id, dto, actor(req));
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @ProductId() id: string,
    @Param('memberId', uuid('Team member')) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.products.updateMember(id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(@ProductId() id: string, @Param('memberId', uuid('Team member')) memberId: string) {
    return this.products.removeMember(id, memberId);
  }

  // ---- links

  @Post(':id/links')
  addLink(@ProductId() id: string, @Body() dto: CreateLinkDto) {
    return this.products.addLink(id, dto);
  }

  @Patch(':id/links/:linkId')
  updateLink(@ProductId() id: string, @Param('linkId', uuid('Link')) linkId: string, @Body() dto: UpdateLinkDto) {
    return this.products.updateLink(id, linkId, dto);
  }

  @Delete(':id/links/:linkId')
  removeLink(@ProductId() id: string, @Param('linkId', uuid('Link')) linkId: string) {
    return this.products.removeLink(id, linkId);
  }

  // ---- domains

  @Post(':id/domains')
  addDomain(@ProductId() id: string, @Body() dto: CreateDomainDto) {
    return this.products.addDomain(id, dto);
  }

  @Patch(':id/domains/:domainId')
  updateDomain(
    @ProductId() id: string,
    @Param('domainId', uuid('Domain')) domainId: string,
    @Body() dto: UpdateDomainDto,
  ) {
    return this.products.updateDomain(id, domainId, dto);
  }

  @Delete(':id/domains/:domainId')
  removeDomain(@ProductId() id: string, @Param('domainId', uuid('Domain')) domainId: string) {
    return this.products.removeDomain(id, domainId);
  }

  // ---- updates

  @Get(':id/updates')
  listUpdates(@ProductId() id: string) {
    return this.updates.list(id);
  }

  @Post(':id/updates')
  @UseInterceptors(filesInterceptor())
  createUpdate(
    @ProductId() id: string,
    @Body() dto: CreateUpdateDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    return this.updates.create(id, dto, files || [], actor(req));
  }

  @Patch(':id/updates/:updateId')
  editUpdate(
    @ProductId() id: string,
    @Param('updateId', uuid('Update')) updateId: string,
    @Body() dto: EditUpdateDto,
    @Request() req: any,
  ) {
    return this.updates.edit(id, updateId, dto, actor(req));
  }

  @Delete(':id/updates/:updateId')
  removeUpdate(@ProductId() id: string, @Param('updateId', uuid('Update')) updateId: string) {
    return this.updates.remove(id, updateId);
  }

  @Post(':id/updates/:updateId/comments')
  addComment(
    @ProductId() id: string,
    @Param('updateId', uuid('Update')) updateId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    return this.updates.addComment(id, updateId, dto, actor(req));
  }

  @Delete(':id/updates/:updateId/comments/:commentId')
  removeComment(
    @ProductId() id: string,
    @Param('updateId', uuid('Update')) updateId: string,
    @Param('commentId', uuid('Reply')) commentId: string,
    @Request() req: any,
  ) {
    return this.updates.removeComment(id, updateId, commentId, actor(req));
  }

  // ---- files

  @Get(':id/files')
  listFiles(@ProductId() id: string) {
    return this.files.list(id);
  }

  @Post(':id/files')
  @UseInterceptors(filesInterceptor())
  uploadFiles(
    @ProductId() id: string,
    @Body() dto: UploadFilesDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: any,
  ) {
    return this.files.upload(id, files || [], dto.folder, actor(req));
  }

  @Delete(':id/files/:fileId')
  removeFile(@ProductId() id: string, @Param('fileId', uuid('File')) fileId: string) {
    return this.files.remove(id, fileId);
  }
}
