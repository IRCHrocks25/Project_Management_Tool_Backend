import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssistantService, AssistantUser } from './assistant.service';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  private actor(req: any): AssistantUser {
    return { userId: req.user?.userId || req.user?.id, role: req.user?.role, name: req.user?.name };
  }

  @Get('conversations')
  list(@Request() req: any) {
    return this.assistant.listConversations(this.actor(req));
  }

  @Get('conversations/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.assistant.getConversation(id, this.actor(req));
  }

  @Post('files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    return this.assistant.saveFile(file, this.actor(req));
  }

  @Post('chat')
  chat(
    @Body() body: { conversationId?: string; message: string; fileIds?: string[]; page?: string; localTime?: string },
    @Request() req: any,
  ) {
    return this.assistant.chat(body, this.actor(req));
  }

  @Post('conversations/:id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decisions: Record<string, 'approve' | 'reject'> },
    @Request() req: any,
  ) {
    return this.assistant.decide(id, body?.decisions || {}, this.actor(req));
  }
}
