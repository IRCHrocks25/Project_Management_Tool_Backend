import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import { ClaimClientLinkDto, ClientForgotCodeDto, ClientResetCodeDto, ClientSignInDto } from './dto/drive-client.dto';
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

/** The whole of what a client can reach. Read-only on purpose: nothing here writes to a file. */
@Controller('client-portal')
@UseGuards(ClientIpThrottlerGuard)
export class DriveClientPortalController {
  constructor(
    private readonly clients: DriveClientsService,
    private readonly drive: DrivelyService,
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
}
