import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import { ClientIpThrottlerGuard } from '../forms/forms.controller';
import { DriveClientsService } from './drive-clients.service';
import { CommentActor, DriveCommentsService } from './drive-comments.service';
import { ClaimClientLinkDto, ClientForgotCodeDto, ClientResetCodeDto, ClientSignInDto } from './dto/drive-client.dto';
import { CreateCommentDto, ResolveCommentDto, UpdateCommentDto } from './dto/drive-comment.dto';
import { DrivelyService } from './drively.service';

/** Only a client session gets through. A team member's token fails, and a client's token fails everywhere else. */
@Injectable()
export class DriveClientGuard implements CanActivate {
  constructor(private readonly clients: DriveClientsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization || '';
    const claims = this.clients.verifyToken(header.startsWith('Bearer ') ? header.slice(7) : null);
    const session = claims && (await this.clients.activeSession(claims.clientId, claims.tokenVersion));
    if (!session) throw new UnauthorizedException('Please sign in again.');
    req.driveClient = session;
    return true;
  }
}

const ItemId = () =>
  Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('File not found.') }));

const CommentId = () =>
  Param('commentId', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Comment not found.') }));
const client = (req: any): CommentActor => ({ kind: 'client', clientId: req.driveClient.id, name: req.driveClient.name });

/** The whole of what a client can reach. Nothing here changes a file: the only thing a client can add is a comment. */
@Controller('client-portal')
@UseGuards(ClientIpThrottlerGuard)
export class DriveClientPortalController {
  constructor(
    private readonly clients: DriveClientsService,
    private readonly drive: DrivelyService,
    private readonly comments: DriveCommentsService,
  ) {}

  @Get('links/:token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  describeLink(@Param('token') token: string) {
    return this.clients.describeLink(token);
  }

  @Post('links/:token/claim')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  claim(@Param('token') token: string, @Body() dto: ClaimClientLinkDto) {
    return this.clients.claimLink(token, dto);
  }

  @Post('sign-in')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  signIn(@Body() dto: ClientSignInDto) {
    return this.clients.signIn(dto);
  }

  @Post('forgot-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgot(@Body() dto: ClientForgotCodeDto) {
    return this.clients.forgotCode(dto.email);
  }

  @Post('reset-code')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reset(@Body() dto: ClientResetCodeDto) {
    return this.clients.resetCode(dto);
  }

  @Get('me')
  @UseGuards(DriveClientGuard)
  me(@Request() req: any) {
    const { id, name, email } = req.driveClient;
    return { id, name, hasEmail: !!email };
  }

  @Get('items')
  @UseGuards(DriveClientGuard)
  list(@Query('parentId') parentId: string | undefined, @Request() req: any) {
    if (parentId && !isUUID(parentId)) throw new NotFoundException('File not found.');
    return this.drive.clientList(parentId || null, req.driveClient.id);
  }

  @Get('items/:id')
  @UseGuards(DriveClientGuard)
  get(@ItemId() id: string, @Request() req: any) {
    return this.drive.clientGet(id, req.driveClient.id);
  }

  @Get('items/:id/link')
  @UseGuards(DriveClientGuard)
  link(@ItemId() id: string, @Request() req: any) {
    return this.drive.clientLink(id, req.driveClient.id);
  }

  @Get('items/:id/comments')
  @UseGuards(DriveClientGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listComments(@ItemId() id: string, @Request() req: any) {
    return this.comments.list(id, client(req));
  }

  @Post('items/:id/comments')
  @UseGuards(DriveClientGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  addComment(@ItemId() id: string, @Body() dto: CreateCommentDto, @Request() req: any) {
    return this.comments.create(id, dto, client(req));
  }

  @Patch('comments/:commentId')
  @UseGuards(DriveClientGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateComment(@CommentId() commentId: string, @Body() dto: UpdateCommentDto, @Request() req: any) {
    return this.comments.update(commentId, dto.body, client(req));
  }

  @Delete('comments/:commentId')
  @UseGuards(DriveClientGuard)
  deleteComment(@CommentId() commentId: string, @Request() req: any) {
    return this.comments.remove(commentId, client(req));
  }

  @Post('comments/:commentId/resolve')
  @HttpCode(200)
  @UseGuards(DriveClientGuard)
  resolveComment(@CommentId() commentId: string, @Body() dto: ResolveCommentDto, @Request() req: any) {
    return this.comments.resolve(commentId, dto.resolved, client(req));
  }
}
