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
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateOnboardingPhaseDto } from './dto/update-onboarding-phase.dto';
import { WebhookGuard } from './guards/webhook.guard';
import { UserRole } from '../users/entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req: any) {
    try {
      const userId = req.user?.userId;
      return await this.projectsService.create(createProjectDto, userId);
    } catch (error: any) {
      console.error('[ProjectsController] Error in create:', error);
      console.error('[ProjectsController] Error stack:', error?.stack);
      console.error(
        '[ProjectsController] Request body:',
        JSON.stringify(createProjectDto, null, 2),
      );
      throw error;
    }
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
  async findAll(@Request() req: any, @Query('includeArchived') includeArchived?: string) {
    const includeArchivedBool = includeArchived === 'true';
    return this.projectsService.findAll(req.user?.userId, req.user?.role, includeArchivedBool);
  }

  @Get('stats')
  async getStats(@Request() req: any) {
    return this.projectsService.getStats(req.user?.userId, req.user?.role);
  }

  @Get('rapid-prospect')
  @UseGuards(JwtAuthGuard)
  async getRapidProspectProjects(@Request() req: any) {
    return this.projectsService.getRapidProspectProjects(req.user?.userId, req.user?.role);
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
  @UseGuards(JwtAuthGuard)
  async archiveProject(@Param('id') id: string, @Request() req: any) {
    // Restrict archiving to PM and Admin roles
    const userRole = req.user?.role;

    // Normalize role comparison - handle both enum and string values
    const normalizedRole = typeof userRole === 'string' ? userRole.trim() : userRole;
    const isProjectManager =
      normalizedRole === UserRole.PROJECT_MANAGER || normalizedRole === 'Project Manager';
    const isFounder = normalizedRole === UserRole.FOUNDER_CEO || normalizedRole === 'FOUNDER/CEO';

    if (!isProjectManager && !isFounder) {
      throw new ForbiddenException(
        `Only Project Managers and Admins can archive projects. Your role: "${userRole || 'undefined'}"`,
      );
    }

    return this.projectsService.archiveProject(id, req.user?.userId);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard)
  async completeProject(@Param('id') id: string, @Request() req: any) {
    try {
      // Restrict completing to PM and Admin roles
      const userRole = req.user?.role;

      // Normalize role comparison - handle both enum and string values
      const normalizedRole = typeof userRole === 'string' ? userRole.trim() : userRole;
      const isProjectManager =
        normalizedRole === UserRole.PROJECT_MANAGER || normalizedRole === 'Project Manager';
      const isFounder = normalizedRole === UserRole.FOUNDER_CEO || normalizedRole === 'FOUNDER/CEO';

      if (!isProjectManager && !isFounder) {
        throw new ForbiddenException(
          `Only Project Managers and Admins can mark projects as complete. Your role: "${userRole || 'undefined'}"`,
        );
      }

      console.log(`[ProjectsController] Completing project ${id} for user ${req.user?.userId}`);
      return await this.projectsService.completeProject(id, req.user?.userId);
    } catch (error: any) {
      console.error(`[ProjectsController] Error in completeProject:`, error);
      console.error(`[ProjectsController] Error stack:`, error.stack);
      throw error;
    }
  }

  @Get('completed')
  @UseGuards(JwtAuthGuard)
  async getCompletedProjects(@Request() req: any) {
    return this.projectsService.getCompletedProjects(req.user?.userId, req.user?.role);
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

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() updateProjectDto: UpdateProjectDto) {
    return this.projectsService.update(id, updateProjectDto);
  }

  @Patch(':id/onboarding-phase')
  @UseGuards(JwtAuthGuard)
  async updateOnboardingPhase(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingPhaseDto,
    @Request() req: any,
  ) {
    return this.projectsService.updateOnboardingPhase(id, dto, req.user?.userId || req.user?.id);
  }
}
