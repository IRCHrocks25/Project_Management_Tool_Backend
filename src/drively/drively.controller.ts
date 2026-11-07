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
import { DriveClientsService } from './drive-clients.service';
import { CommentActor, DriveCommentsService } from './drive-comments.service';
import { ShareWithClientDto } from './dto/drive-client.dto';
import { ClientPermissionDto, CreateCommentDto, OptionalClientPermissionDto, ResolveCommentDto, UpdateCommentDto } from './dto/drive-comment.dto';
import { CreateDriveItemDto, SetDriveSharesDto, StarDriveItemDto, UpdateDriveItemDto } from './dto/drively.dto';
import { DriveView, DrivelyService, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from './drively.service';

const ItemId = () =>
  Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('File not found.') }));
const CommentId = () =>
  Param('commentId', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Comment not found.') }));
const actor = (req: any) => ({ userId: req.user?.userId || req.user?.id, role: req.user?.role });
const team = (req: any): CommentActor => ({ kind: 'team', actor: actor(req) });

@Controller('drively')
@UseGuards(JwtAuthGuard)
export class DrivelyController {
  constructor(
    private readonly drive: DrivelyService,
    private readonly clients: DriveClientsService,
    private readonly comments: DriveCommentsService,
  ) {}

  @Get('items/:id/comments')
  listComments(@ItemId() id: string, @Request() req: any) {
    return this.comments.list(id, team(req));
  }

  @Post('items/:id/comments')
  addComment(@ItemId() id: string, @Body() dto: CreateCommentDto, @Request() req: any) {
    return this.comments.create(id, dto, team(req));
  }

  @Patch('comments/:commentId')
  updateComment(@CommentId() commentId: string, @Body() dto: UpdateCommentDto, @Request() req: any) {
    return this.comments.update(commentId, dto.body, team(req));
  }

  @Delete('comments/:commentId')
  deleteComment(@CommentId() commentId: string, @Request() req: any) {
    return this.comments.remove(commentId, team(req));
  }

  @Post('comments/:commentId/resolve')
  @HttpCode(200)
  resolveComment(@CommentId() commentId: string, @Body() dto: ResolveCommentDto, @Request() req: any) {
    return this.comments.resolve(commentId, dto.resolved, team(req));
  }

  @Get('clients')
  listClients() {
    return this.clients.listClients();
  }

  @Get('items/:id/client-access')
  clientAccess(@ItemId() id: string, @Request() req: any) {
    return this.clients.listAccess(id, actor(req));
  }

  @Post('items/:id/client-access')
  @HttpCode(200)
  shareWithClient(@ItemId() id: string, @Body() dto: ShareWithClientDto, @Request() req: any) {
    return this.clients.shareWithClient(id, dto.clientId, dto.permission, actor(req));
  }

  @Patch('items/:id/client-access/:clientId')
  setClientPermission(@ItemId() id: string, @Param('clientId', ParseUUIDPipe) clientId: string, @Body() dto: ClientPermissionDto, @Request() req: any) {
    return this.clients.setClientPermission(id, clientId, dto.permission, actor(req));
  }

  @Delete('items/:id/client-access/:clientId')
  removeClientAccess(@ItemId() id: string, @Param('clientId', ParseUUIDPipe) clientId: string, @Request() req: any) {
    return this.clients.removeAccess(id, clientId, actor(req));
  }

  @Post('items/:id/client-access/:clientId/new-code-link')
  newCodeLink(@ItemId() id: string, @Param('clientId', ParseUUIDPipe) clientId: string, @Request() req: any) {
    return this.clients.createNewCodeLink(id, clientId, actor(req));
  }

  @Post('items/:id/client-links')
  createClientLink(@ItemId() id: string, @Body() dto: OptionalClientPermissionDto, @Request() req: any) {
    return this.clients.createInvite(id, dto?.permission, actor(req));
  }

  @Delete('items/:id/client-links/:linkId')
  cancelClientLink(@ItemId() id: string, @Param('linkId', ParseUUIDPipe) linkId: string, @Request() req: any) {
    return this.clients.cancelLink(id, linkId, actor(req));
  }

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
