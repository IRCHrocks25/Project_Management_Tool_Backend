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
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateProjectWebhookDto } from './dto/create-project-webhook.dto';
import { UpdateProjectStageDto } from './dto/update-project-stage.dto';
import { WebhookGuard } from './guards/webhook.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(createProjectDto, req.user?.userId);
  }

  @Post('webhook')
  @UseGuards(WebhookGuard)
  @HttpCode(HttpStatus.CREATED)
  async createFromWebhook(@Body() webhookDto: CreateProjectWebhookDto) {
    try {
      return await this.projectsService.createFromWebhook(webhookDto);
    } catch (error: any) {
      console.error('[ProjectsController] Error in createFromWebhook:', error);
      console.error('[ProjectsController] Error stack:', error.stack);
      throw error;
    }
  }

  @Get('webhook/pm')
  @UseGuards(WebhookGuard)
  async getWebhookPM() {
    return this.projectsService.getWebhookPM();
  }

  @Get()
  async findAll(
    @Request() req: any,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const includeArchivedBool = includeArchived === 'true';
    return this.projectsService.findAll(
      req.user?.userId,
      req.user?.role,
      includeArchivedBool,
    );
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    return this.projectsService.getStats(req.user?.userId, req.user?.role);
  }

  @Get(':id/activity')
  async getActivity(@Param('id') id: string) {
    return this.projectsService.getActivity(id);
  }

  @Patch(':id/stage')
  async updateStage(@Param('id') id: string, @Body() updateStageDto: UpdateProjectStageDto) {
    return this.projectsService.updateStage(id, updateStageDto);
  }

  @Patch(':id/close')
  async closeProject(@Param('id') id: string) {
    return this.projectsService.closeProject(id);
  }

  @Patch(':id/archive')
  async archiveProject(@Param('id') id: string, @Request() req: any) {
    // Restrict archiving to PM and Admin roles
    const userRole = req.user?.role;
    if (userRole !== 'Project Manager' && userRole !== 'FOUNDER/CEO') {
      throw new ForbiddenException('Only Project Managers and Admins can archive projects');
    }
    return this.projectsService.archiveProject(id, req.user?.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
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

