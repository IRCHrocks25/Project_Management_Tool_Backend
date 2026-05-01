import 'multer';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  Delete,
  Put,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { AttachmentsService } from './attachments.service';
import { TransfersService, TransferTaskPayload } from './transfers.service';
import { TaskStatus } from './entities/task.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTaskQuestionDto } from './dto/create-task-question.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly transfersService: TransfersService,
  ) {}

  @Get()
  async findAll(
    @Query('projectId') projectId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string,
    @Query('taskType') taskType?: string,
  ) {
    return this.tasksService.findAll(
      projectId,
      assignedToId,
      limit ? parseInt(limit) : undefined,
      all === 'true',
      taskType,
    );
  }

  // Static and sub-resource routes MUST appear before /:id to avoid route conflicts

  @Get('conversations/all')
  @UseGuards(JwtAuthGuard)
  async getAllConversations() {
    return this.tasksService.getAllConversations();
  }

  @Delete('questions/:questionId')
  @UseGuards(JwtAuthGuard)
  async deleteQuestion(@Param('questionId') questionId: string) {
    return this.tasksService.deleteQuestion(questionId);
  }

  @Get(':id/conversations')
  @UseGuards(JwtAuthGuard)
  async getConversations(@Param('id') id: string) {
    return this.tasksService.getConversations(id);
  }

  @Post(':id/questions')
  @UseGuards(JwtAuthGuard)
  async createQuestion(
    @Param('id') id: string,
    @Body() createDto: CreateTaskQuestionDto,
    @Request() req: any,
  ) {
    return this.tasksService.createQuestion(id, createDto, req.user.userId);
  }

  @Get(':id/attachments')
  @UseGuards(JwtAuthGuard)
  async getAttachments(@Param('id') taskId: string) {
    return this.attachmentsService.findByTask(taskId);
  }

  @Post(':id/attachments/link')
  @UseGuards(JwtAuthGuard)
  async addAttachmentLink(
    @Param('id') taskId: string,
    @Body() body: { url: string; label?: string; note?: string },
    @Request() req: any,
  ) {
    return this.attachmentsService.addLink(taskId, body.url, body.label, req.user.userId, body.note);
  }

  @Post(':id/attachments')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  async uploadAttachments(
    @Param('id') taskId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { note?: string },
    @Request() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    return this.attachmentsService.upload(taskId, files, req.user.userId, body?.note);
  }

  @Delete(':id/attachments/:attachmentId')
  @UseGuards(JwtAuthGuard)
  async deleteAttachment(@Param('attachmentId') attachmentId: string, @Request() req: any) {
    return this.attachmentsService.delete(attachmentId, req.user.userId);
  }

  @Post(':id/transfer')
  @UseGuards(JwtAuthGuard)
  async transferTask(
    @Param('id') id: string,
    @Body() body: TransferTaskPayload,
    @Request() req: any,
  ) {
    return this.transfersService.transferTask(id, body, req.user.userId);
  }

  @Get(':id/transfers')
  @UseGuards(JwtAuthGuard)
  async getTransfers(@Param('id') id: string) {
    return this.transfersService.getTransfers(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const [task, attachments] = await Promise.all([
      this.tasksService.findOne(id),
      this.attachmentsService.findByTask(id),
    ]);
    return { ...task, attachments };
  }

  @Post()
  async create(@Body() createTaskDto: any, @Request() req: any) {
    return this.tasksService.create(createTaskDto, req.user?.userId || req.user?.id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: TaskStatus;
      isCompleted?: boolean;
      fileUrl?: string;
      deliverableType?: string;
      deliverableId?: string;
      reviewIntent?: 'for_approval' | 'revision';
    },
    @Request() req: any,
  ) {
    return this.tasksService.updateStatus(
      id,
      body.status,
      body.isCompleted,
      body.fileUrl,
      body.deliverableType,
      body.deliverableId,
      req.user?.userId || req.user?.id,
      body.reviewIntent,
    );
  }

  @Patch(':id/assign')
  async assignTask(
    @Param('id') id: string,
    @Body() body: { assignedToId?: string; userIds?: string[] },
  ) {
    if (body.userIds && Array.isArray(body.userIds)) {
      return this.tasksService.assignTaskToMultiple(id, body.userIds);
    } else if (body.assignedToId) {
      return this.tasksService.assignTask(id, body.assignedToId);
    } else {
      throw new BadRequestException('Either assignedToId or userIds must be provided');
    }
  }

  @Patch(':id/submit')
  async submitOnboardingData(
    @Param('id') id: string,
    @Body() body: { submissionData: string; submissionType: 'url' | 'text' },
  ) {
    return this.tasksService.submitOnboardingData(id, body.submissionData, body.submissionType);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    updateTaskDto: { title?: string; description?: string; dueDate?: Date; deliverableId?: string },
  ) {
    return this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  @Post('questions/:questionId/comments')
  @UseGuards(JwtAuthGuard)
  async createComment(
    @Param('questionId') questionId: string,
    @Body() createDto: CreateTaskCommentDto,
    @Request() req: any,
  ) {
    return this.tasksService.createComment(questionId, createDto, req.user.userId);
  }
}
