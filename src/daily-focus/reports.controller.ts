import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DailyFocusService } from './daily-focus.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly dailyFocusService: DailyFocusService) {}

  /** End-of-day: planned pins vs tasks completed in org timezone that calendar day */
  @Get('end-of-day')
  @UseGuards(JwtAuthGuard)
  async endOfDay(@Query('date') date: string) {
    if (!date) {
      throw new BadRequestException('Query parameter "date" (YYYY-MM-DD) is required');
    }
    return this.dailyFocusService.getEndOfDayReport(date);
  }

  /** Save/overwrite EOD snapshot for a date */
  @Post('end-of-day/archive')
  @UseGuards(JwtAuthGuard)
  async saveEndOfDayArchive(@Body('date') date: string, @Request() req: any) {
    if (!date) {
      throw new BadRequestException('Body field "date" (YYYY-MM-DD) is required');
    }
    return this.dailyFocusService.saveEndOfDaySnapshot(date, req.user.userId);
  }

  /** List archived EOD snapshots */
  @Get('end-of-day/archive')
  @UseGuards(JwtAuthGuard)
  async listEndOfDayArchives() {
    return this.dailyFocusService.listEndOfDaySnapshots();
  }

  /** Get one archived EOD snapshot */
  @Get('end-of-day/archive/:id')
  @UseGuards(JwtAuthGuard)
  async getEndOfDayArchive(@Param('id') id: string) {
    return this.dailyFocusService.getEndOfDaySnapshot(id);
  }
}
