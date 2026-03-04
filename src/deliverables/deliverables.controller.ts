import { Controller, Get, Post, Patch, Param, Body, Query, Delete, Request, UseGuards } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { UpdateDeliverableStatusDto } from './dto/update-deliverable-status.dto';
import { CreateDeliverableDto } from './dto/create-deliverable.dto';

@Controller('deliverables')
export class DeliverablesController {
  constructor(private readonly deliverablesService: DeliverablesService) {}

  @Post()
  async create(@Body() createDto: CreateDeliverableDto) {
    return this.deliverablesService.create(createDto.projectId, createDto.type, createDto.customType);
  }

  @Get()
  async findAll(@Query('projectId') projectId?: string) {
    return this.deliverablesService.findAll(projectId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateDeliverableStatusDto,
    @Request() req: any,
  ) {
    return this.deliverablesService.updateStatus(
      id, 
      updateDto.status, 
      updateDto.notes, 
      req.user?.userId || req.user?.id,
      updateDto.fileUrl
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.deliverablesService.findOne(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.deliverablesService.remove(id);
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string, @Query('fileUrl') fileUrl?: string) {
    return this.deliverablesService.getHistory(id, fileUrl);
  }

  @Post(':id/team-members')
  async addTeamMember(@Param('id') deliverableId: string, @Body() body: { userId: string }) {
    return this.deliverablesService.addTeamMember(deliverableId, body.userId);
  }

  @Get(':id/team-members')
  async getTeamMembers(@Param('id') deliverableId: string) {
    return this.deliverablesService.getTeamMembers(deliverableId);
  }

  @Delete(':id/team-members/:userId')
  async removeTeamMember(@Param('id') deliverableId: string, @Param('userId') userId: string) {
    return this.deliverablesService.removeTeamMember(deliverableId, userId);
  }
}

