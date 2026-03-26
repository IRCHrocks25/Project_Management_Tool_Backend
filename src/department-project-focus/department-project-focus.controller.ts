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
import { DepartmentProjectFocusService } from './department-project-focus.service';
import { UpsertDepartmentProjectFocusDto } from './dto/upsert-department-project-focus.dto';

@Controller('department-project-focus')
export class DepartmentProjectFocusController {
  constructor(private readonly service: DepartmentProjectFocusService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async get(
    @Query('date') date: string,
    @Query('departmentKey') departmentKey: string,
  ) {
    if (!date || !departmentKey) {
      throw new BadRequestException('Query parameters "date" and "departmentKey" are required');
    }
    return this.service.findByDateAndDepartment(date, departmentKey);
  }

  /** PM / Head PM — canonical priorities shown on department dashboards. */
  @Put()
  @UseGuards(JwtAuthGuard)
  async putPm(
    @Body() body: UpsertDepartmentProjectFocusDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.service.upsertPmPins(body, req.user.userId);
  }

  /** Team lead (or PM) — extra clients on top of PM list for that department/day. */
  @Put('team-override')
  @UseGuards(JwtAuthGuard)
  async putTeamOverride(
    @Body() body: UpsertDepartmentProjectFocusDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.service.upsertTeamOverride(body, req.user.userId);
  }
}
