import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Injectable,
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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateFormDto, SubmitFormDto, UpdateFormDto } from './dto/form.dto';
import {
  FormsService,
  ListScope,
  MAX_BUILDER_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
  MAX_RESPONDENT_FILE_BYTES,
} from './forms.service';

/** A malformed id can't match anything, so answer 404 rather than a generic 400. */
const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException(`${what} not found.`) });
const FormId = () => Param('id', uuid('Form'));

const filesInterceptor = (maxBytes: number) =>
  FilesInterceptor('files', MAX_FILES_PER_REQUEST, { limits: { fileSize: maxBytes } });

const actor = (req: any): string => req.user?.userId || req.user?.id;

const SCOPES: ListScope[] = ['mine', 'all', 'templates'];

/** Team routes: any signed-in team member can build forms and read responses. */
@Controller('forms')
@UseGuards(JwtAuthGuard)
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  list(
    @Query('scope') scope: string | undefined,
    @Query('q') q: string | undefined,
    @Request() req: any,
  ) {
    const s = (scope || 'all') as ListScope;
    if (!SCOPES.includes(s))
      throw new BadRequestException(`scope must be one of: ${SCOPES.join(', ')}.`);
    return this.forms.list(s, q, actor(req));
  }

  @Post()
  create(@Body() dto: CreateFormDto, @Request() req: any) {
    return this.forms.create(dto, actor(req));
  }

  @Get(':id')
  get(@FormId() id: string) {
    return this.forms.get(id);
  }

  @Patch(':id')
  update(@FormId() id: string, @Body() dto: UpdateFormDto) {
    return this.forms.update(id, dto);
  }

  @Delete(':id')
  remove(@FormId() id: string) {
    return this.forms.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@FormId() id: string, @Request() req: any) {
    return this.forms.duplicate(id, actor(req));
  }

  @Post(':id/save-as-template')
  saveAsTemplate(@FormId() id: string, @Request() req: any) {
    return this.forms.saveAsTemplate(id, actor(req));
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@FormId() id: string) {
    return this.forms.publish(id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@FormId() id: string) {
    return this.forms.close(id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@FormId() id: string) {
    return this.forms.reopen(id);
  }

  @Post(':id/regenerate-link')
  @HttpCode(200)
  regenerateLink(@FormId() id: string) {
    return this.forms.regenerateLink(id);
  }

  @Post(':id/files')
  @UseInterceptors(filesInterceptor(MAX_BUILDER_FILE_BYTES))
  uploadFiles(@FormId() id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.forms.uploadBuilderFiles(id, files);
  }

  @Get(':id/responses')
  responses(@FormId() id: string) {
    return this.forms.listResponses(id);
  }

  @Delete(':id/responses/:responseId')
  deleteResponse(@FormId() id: string, @Param('responseId', uuid('Response')) responseId: string) {
    return this.forms.deleteResponse(id, responseId);
  }
}

/**
 * Rate-limits per client IP. Railway sits behind a proxy, so `req.ip` would be the
 * proxy for everyone; the first X-Forwarded-For entry is the real client.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
    return first || req.ip;
  }
}

/** Public client routes. No JwtAuthGuard on purpose: the token is the credential. */
@Controller('public/forms')
@UseGuards(ClientIpThrottlerGuard)
export class PublicFormsController {
  constructor(private readonly forms: FormsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  get(@Param('token') token: string) {
    return this.forms.getPublic(token);
  }

  @Post(':token/files')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(filesInterceptor(MAX_RESPONDENT_FILE_BYTES))
  uploadFiles(@Param('token') token: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.forms.uploadRespondentFiles(token, files);
  }

  @Post(':token/responses')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  submit(@Param('token') token: string, @Body() dto: SubmitFormDto) {
    return this.forms.submit(token, dto);
  }
}
