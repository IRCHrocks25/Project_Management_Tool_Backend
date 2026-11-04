import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailsService } from './emails.service';
import { CreateEmailDto } from './dto/create-email.dto';

@UseGuards(JwtAuthGuard)
@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post()
  async create(@Body() createEmailDto: CreateEmailDto, @Request() req: any) {
    return this.emailsService.create(createEmailDto, req.user?.userId || req.user?.id);
  }

  @Get('project/:projectId')
  async findAll(@Param('projectId') projectId: string) {
    return this.emailsService.findAll(projectId);
  }
}
