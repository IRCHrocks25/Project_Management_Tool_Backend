import {
  Controller,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DailyFocusService } from './daily-focus.service';
import { UpdateDailyFocusDto } from './dto/update-daily-focus.dto';
import { UserRole } from '../users/entities/user.entity';

@Controller('daily-focus')
export class DailyFocusController {
  constructor(private readonly dailyFocusService: DailyFocusService) {}

  /** Config for clients (max slots per department) */
  @Get('meta')
  @UseGuards(JwtAuthGuard)
  getMeta() {
    return { maxRankPerDepartment: this.dailyFocusService.getMaxRank() };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async get(@Query('date') date: string) {
    if (!date) {
      throw new BadRequestException('Query parameter "date" (YYYY-MM-DD) is required');
    }
    return this.dailyFocusService.findByDate(date);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async put(@Body() body: UpdateDailyFocusDto, @Request() req: { user: { userId: string; role: UserRole } }) {
    return this.dailyFocusService.upsert(body, req.user.userId, req.user.role);
  }
}
