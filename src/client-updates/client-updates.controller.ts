import 'multer';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientUpdatesService } from './client-updates.service';
import { CreateClientUpdateDto } from './dto/create-client-update.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { SubmitFormDto } from './dto/submit-form.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('client-updates')
export class ClientUpdatesController {
  constructor(private readonly clientUpdatesService: ClientUpdatesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createDto: CreateClientUpdateDto, @Request() req: any) {
    return await this.clientUpdatesService.create(createDto, req.user.userId);
  }

  @Get('project/:projectId')
  @UseGuards(JwtAuthGuard)
  async findAllByProject(@Param('projectId') projectId: string) {
    return await this.clientUpdatesService.findAllByProject(projectId);
  }

  @Post(':updateId/comments')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @Param('updateId') updateId: string,
    @Body() createDto: CreateCommentDto,
    @Request() req: any,
  ) {
    return await this.clientUpdatesService.createComment(updateId, createDto, req.user.userId);
  }

  @Get(':updateId/comments')
  @UseGuards(JwtAuthGuard)
  async getComments(@Param('updateId') updateId: string) {
    return await this.clientUpdatesService.getComments(updateId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return await this.clientUpdatesService.findOne(id);
  }

  @Post('forms')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createForm(@Body() createDto: CreateFormDto) {
    return await this.clientUpdatesService.createForm(createDto);
  }

  @Post('forms/submit')
  @HttpCode(HttpStatus.CREATED)
  async submitForm(@Body() submitDto: SubmitFormDto) {
    return await this.clientUpdatesService.submitForm(submitDto);
  }

  @Get('forms/token/:publicToken')
  async getFormByToken(@Param('publicToken') publicToken: string) {
    return await this.clientUpdatesService.getFormByToken(publicToken);
  }

  @Get('forms/rapid-prospect/latest')
  async getLatestRapidProspectFormToken() {
    return await this.clientUpdatesService.getLatestRapidProspectPublishedFormToken();
  }

  @Post('forms/:formId/publish')
  @UseGuards(JwtAuthGuard)
  async publishForm(@Param('formId') formId: string) {
    return await this.clientUpdatesService.publishForm(formId);
  }

  @Post('forms/:formId')
  @UseGuards(JwtAuthGuard)
  async updateForm(@Param('formId') formId: string, @Body() body: { blocks: any[] }) {
    return await this.clientUpdatesService.updateForm(formId, body.blocks);
  }

  @Get('forms/:formId/submissions')
  @UseGuards(JwtAuthGuard)
  async getFormSubmissions(@Param('formId') formId: string) {
    return await this.clientUpdatesService.getFormSubmissions(formId);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId?: string,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    const url = await this.clientUpdatesService.uploadImage(file, projectId);
    return { url };
  }

  @Post('upload-image-public')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImagePublic(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId?: string,
  ) {
    if (!file) {
      throw new Error('No file uploaded');
    }
    const url = await this.clientUpdatesService.uploadImage(file, projectId);
    return { url };
  }
}
