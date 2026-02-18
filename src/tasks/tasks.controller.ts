import { Controller, Get, Post, Body, Patch, Param, Query, Delete, Put } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TaskStatus } from './entities/task.entity';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async findAll(@Query('projectId') projectId?: string, @Query('assignedToId') assignedToId?: string) {
    return this.tasksService.findAll(projectId, assignedToId);
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
  async updateStatus(@Param('id') id: string, @Body() body: { status: TaskStatus; isCompleted?: boolean; fileUrl?: string; deliverableType?: string }) {
    return this.tasksService.updateStatus(id, body.status, body.isCompleted, body.fileUrl, body.deliverableType);
  }

  @Patch(':id/assign')
  async assignTask(@Param('id') id: string, @Body() body: { assignedToId: string }) {
    return this.tasksService.assignTask(id, body.assignedToId);
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
}

