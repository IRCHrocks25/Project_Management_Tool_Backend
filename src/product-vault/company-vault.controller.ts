import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RevealCredentialDto } from './dto/credential.dto';
import { CreateVaultItemDto, UpdateVaultItemDto } from './dto/company-vault.dto';
import { CompanyVaultService } from './company-vault.service';
import { Uuid, actorOf } from './product-vault.controller';

/** Company and personal logins. Anyone without access gets 404 on every route. */
@Controller('vault/items')
@UseGuards(JwtAuthGuard)
export class CompanyVaultController {
  constructor(private readonly vault: CompanyVaultService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query('scope') scope: string, @Request() req: any) {
    if (scope !== 'company' && scope !== 'personal') {
      throw new BadRequestException('Scope must be company or personal.');
    }
    return this.vault.list(scope, actorOf(req));
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateVaultItemDto, @Request() req: any) {
    return this.vault.create(dto, actorOf(req));
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id', Uuid) id: string, @Body() dto: UpdateVaultItemDto, @Request() req: any) {
    return this.vault.update(id, dto, actorOf(req));
  }

  @Delete(':id')
  remove(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.vault.remove(id, actorOf(req));
  }

  @Post(':id/reveal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reveal(@Param('id', Uuid) id: string, @Body() dto: RevealCredentialDto, @Request() req: any) {
    return this.vault.reveal(id, dto.purpose, actorOf(req));
  }

  @Get(':id/events')
  events(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.vault.events(id, actorOf(req));
  }

  @Get(':id/versions')
  versions(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.vault.versions(id, actorOf(req));
  }

  @Post(':id/versions/:vid/reveal')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  revealVersion(@Param('id', Uuid) id: string, @Param('vid', Uuid) vid: string, @Request() req: any) {
    return this.vault.revealVersion(id, vid, actorOf(req));
  }

  @Post(':id/versions/:vid/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  restore(@Param('id', Uuid) id: string, @Param('vid', Uuid) vid: string, @Request() req: any) {
    return this.vault.restoreVersion(id, vid, actorOf(req));
  }
}
