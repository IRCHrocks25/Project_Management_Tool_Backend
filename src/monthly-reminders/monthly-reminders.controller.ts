import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MonthlyRemindersService } from './monthly-reminders.service';
import { CreateMonthlyReminderDto } from './dto/create-monthly-reminder.dto';
import { UpdateMonthlyReminderDto } from './dto/update-monthly-reminder.dto';

@Controller('monthly-reminders')
@UseGuards(JwtAuthGuard)
export class MonthlyRemindersController {
  constructor(private readonly remindersService: MonthlyRemindersService) {}

  @Get()
  async findAll(@Request() req: { user: { userId: string } }) {
    return this.remindersService.findAll(req.user.userId);
  }

  @Get('project/:projectId')
  async findByProject(
    @Param('projectId') projectId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.remindersService.findByProject(projectId, req.user.userId);
  }

  @Post()
  async create(
    @Body() dto: CreateMonthlyReminderDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.remindersService.create(dto, req.user.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMonthlyReminderDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.remindersService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: { user: { userId: string } }) {
    return this.remindersService.remove(id, req.user.userId);
  }
}
