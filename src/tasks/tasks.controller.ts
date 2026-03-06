import { Controller, Get, Post, Body, Patch, Param, Query, Delete, Put, UseGuards, Request } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskStatus } from './entities/task.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTaskQuestionDto } from './dto/create-task-question.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async findAll(
    @Query('projectId') projectId?: string, 
    @Query('assignedToId') assignedToId?: string,
    @Query('limit') limit?: string,
    @Query('all') all?: string
  ) {
    return this.tasksService.findAll(projectId, assignedToId, limit ? parseInt(limit) : undefined, all === 'true');
  }

  // Task Conversation Endpoints - MUST be before @Get(':id') to avoid route conflicts
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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Post()
  async create(@Body() createTaskDto: any) {
    return this.tasksService.create(createTaskDto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: { status: TaskStatus; isCompleted?: boolean; fileUrl?: string; deliverableType?: string; deliverableId?: string }) {
    return this.tasksService.updateStatus(id, body.status, body.isCompleted, body.fileUrl, body.deliverableType, body.deliverableId);
  }

  @Patch(':id/assign')
  async assignTask(
    @Param('id') id: string, 
    @Body() body: { assignedToId?: string; userIds?: string[] }
  ) {
    // Support both single assignee (backward compatibility) and multiple assignees
    if (body.userIds && Array.isArray(body.userIds)) {
      return this.tasksService.assignTaskToMultiple(id, body.userIds);
    } else if (body.assignedToId) {
      return this.tasksService.assignTask(id, body.assignedToId);
    } else {
      throw new Error('Either assignedToId or userIds must be provided');
    }
  }

  @Patch(':id/submit')
  async submitOnboardingData(
    @Param('id') id: string,
    @Body() body: { submissionData: string; submissionType: 'url' | 'text' }
  ) {
    return this.tasksService.submitOnboardingData(id, body.submissionData, body.submissionType);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateTaskDto: { title?: string; description?: string; dueDate?: Date; deliverableId?: string }) {
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

