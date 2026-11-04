import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateCredentialDto,
  CreateShareDto,
  RevealCredentialDto,
  UpdateCredentialDto,
} from './dto/credential.dto';
import { CreateDemoAccountDto, UpdateDemoAccountDto } from './dto/demo-account.dto';
import { ProductVaultService, VaultActor } from './product-vault.service';
import { DemoAccountsService } from './demo-accounts.service';

/** 400 with a readable message instead of Nest's default for malformed ids. */
const Uuid = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('That link points to an invalid id.'),
});

const actorOf = (req: any): VaultActor => ({
  userId: req.user?.userId || req.user?.id,
  role: req.user?.role ?? null,
});

@Controller('products/:id/credentials')
@UseGuards(JwtAuthGuard)
export class ProductCredentialsController {
  constructor(private readonly vault: ProductVaultService) {}

  @Get()
  list(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.vault.listCredentials(id, actorOf(req));
  }

  @Post()
  create(@Param('id', Uuid) id: string, @Body() dto: CreateCredentialDto, @Request() req: any) {
    return this.vault.createCredential(id, dto, actorOf(req));
  }

  @Patch(':credId')
  update(
    @Param('id', Uuid) id: string,
    @Param('credId', Uuid) credId: string,
    @Body() dto: UpdateCredentialDto,
    @Request() req: any,
  ) {
    return this.vault.updateCredential(id, credId, dto, actorOf(req));
  }

  @Delete(':credId')
  remove(@Param('id', Uuid) id: string, @Param('credId', Uuid) credId: string, @Request() req: any) {
    return this.vault.deleteCredential(id, credId, actorOf(req));
  }

  @Post(':credId/reveal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reveal(
    @Param('id', Uuid) id: string,
    @Param('credId', Uuid) credId: string,
    @Body() dto: RevealCredentialDto,
    @Request() req: any,
  ) {
    return this.vault.reveal(id, credId, dto.purpose, actorOf(req));
  }

  @Get(':credId/events')
  events(@Param('id', Uuid) id: string, @Param('credId', Uuid) credId: string) {
    return this.vault.listEvents(id, credId);
  }

  @Post(':credId/shares')
  @Header('Cache-Control', 'no-store')
  createShare(
    @Param('id', Uuid) id: string,
    @Param('credId', Uuid) credId: string,
    @Body() dto: CreateShareDto,
    @Request() req: any,
  ) {
    return this.vault.createShare(id, credId, dto, actorOf(req));
  }

  @Get(':credId/shares')
  listShares(
    @Param('id', Uuid) id: string,
    @Param('credId', Uuid) credId: string,
    @Request() req: any,
  ) {
    return this.vault.listShares(id, credId, actorOf(req));
  }

  @Delete(':credId/shares/:shareId')
  revokeShare(
    @Param('id', Uuid) id: string,
    @Param('credId', Uuid) credId: string,
    @Param('shareId', Uuid) shareId: string,
    @Request() req: any,
  ) {
    return this.vault.revokeShare(id, credId, shareId, actorOf(req));
  }
}

/** Public client share links. No JwtAuthGuard on purpose: the token is the credential. */
@Controller('vault-shares')
export class VaultSharesController {
  constructor(private readonly vault: ProductVaultService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  peek(@Param('token') token: string) {
    return this.vault.peekShare(token);
  }

  @Post(':token/open')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  open(@Param('token') token: string) {
    return this.vault.openShare(token);
  }
}

@Controller('products/:id/demo-accounts')
@UseGuards(JwtAuthGuard)
export class ProductDemoAccountsController {
  constructor(private readonly demos: DemoAccountsService) {}

  @Get()
  list(@Param('id', Uuid) id: string) {
    return this.demos.list(id);
  }

  @Post()
  create(@Param('id', Uuid) id: string, @Body() dto: CreateDemoAccountDto, @Request() req: any) {
    return this.demos.create(id, dto, actorOf(req));
  }

  @Patch(':demoId')
  update(
    @Param('id', Uuid) id: string,
    @Param('demoId', Uuid) demoId: string,
    @Body() dto: UpdateDemoAccountDto,
    @Request() req: any,
  ) {
    return this.demos.update(id, demoId, dto, actorOf(req));
  }

  @Delete(':demoId')
  remove(@Param('id', Uuid) id: string, @Param('demoId', Uuid) demoId: string) {
    return this.demos.remove(id, demoId);
  }
}
