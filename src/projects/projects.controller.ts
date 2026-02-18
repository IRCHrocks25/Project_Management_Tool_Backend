import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(createProjectDto, req.user?.userId);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user?.userId, req.user?.role);
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    return this.projectsService.getStats(req.user?.userId, req.user?.role);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id/stage')
  async updateStage(@Param('id') id: string, @Body() updateStageDto: UpdateProjectStageDto) {
    return this.projectsService.updateStage(id, updateStageDto);
  }

  @Patch(':id/close')
  async closeProject(@Param('id') id: string) {
    return this.projectsService.closeProject(id);
  }

  @Post(':id/generate-onboarding-tasks')
  async generateOnboardingTasks(@Param('id') id: string) {
    try {
      return await this.projectsService.generateOnboardingTasks(id);
    } catch (error: any) {
      console.error('[ProjectsController] Error in generateOnboardingTasks:', error);
      throw error;
    }
  }

  @Post(':id/team-members')
  async addTeamMember(@Param('id') projectId: string, @Body() body: { userId: string }) {
    return this.projectsService.addTeamMember(projectId, body.userId);
  }

  @Get(':id/team-members')
  async getTeamMembers(@Param('id') projectId: string) {
    return this.projectsService.getTeamMembers(projectId);
  }

  @Delete(':id/team-members/:userId')
  async removeTeamMember(@Param('id') projectId: string, @Param('userId') userId: string) {
    return this.projectsService.removeTeamMember(projectId, userId);
  }
}

