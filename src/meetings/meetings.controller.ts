import { Body, Controller, Get, Header, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientIpThrottlerGuard } from '../forms/forms.controller';
import { Uuid } from '../product-vault/product-vault.controller';
import {
  AskToJoinDto,
  CreateMeetingDto,
  GuestDecisionDto,
  GuestLinkDto,
  GuestStatusDto,
  UpdateMeetingDto,
} from './dto/meetings.dto';
import { MeetingActor, MeetingsService } from './meetings.service';

const actorOf = (req: any): MeetingActor => ({ userId: req.user?.userId || req.user?.id });

@Controller('meetings')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  list(@Query('view') view: string, @Request() req: any) {
    return this.meetings.list(view, actorOf(req));
  }

  @Post()
  create(@Body() dto: CreateMeetingDto, @Request() req: any) {
    return this.meetings.create(dto, actorOf(req));
  }

  @Get(':id')
  get(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.get(id, actorOf(req));
  }

  @Patch(':id')
  update(@Param('id', Uuid) id: string, @Body() dto: UpdateMeetingDto, @Request() req: any) {
    return this.meetings.update(id, dto, actorOf(req));
  }

  @Post(':id/join')
  @Header('Cache-Control', 'no-store')
  join(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.join(id, actorOf(req));
  }

  @Post(':id/end')
  end(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.end(id, actorOf(req));
  }

  @Post(':id/cancel')
  cancel(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.cancel(id, actorOf(req));
  }

  @Post(':id/guest-link')
  guestLink(@Param('id', Uuid) id: string, @Body() dto: GuestLinkDto, @Request() req: any) {
    return this.meetings.setGuestLink(id, dto, actorOf(req));
  }

  @Get(':id/guests')
  guests(@Param('id', Uuid) id: string, @Request() req: any) {
    return this.meetings.waitingGuests(id, actorOf(req));
  }

  @Post(':id/guests/:guestId')
  decide(
    @Param('id', Uuid) id: string,
    @Param('guestId', Uuid) guestId: string,
    @Body() dto: GuestDecisionDto,
    @Request() req: any,
  ) {
    return this.meetings.decideGuest(id, guestId, dto.decision, actorOf(req));
  }
}

/** Guest routes. No JwtAuthGuard on purpose: the code in the link is the credential. */
@Controller('public/meetings')
@UseGuards(ClientIpThrottlerGuard)
export class PublicMeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get(':code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  info(@Param('code') code: string) {
    return this.meetings.publicInfo(code);
  }

  @Post(':code/guests')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  ask(@Param('code') code: string, @Body() dto: AskToJoinDto) {
    return this.meetings.askToJoin(code, dto.name);
  }

  @Post(':code/guests/:guestId/status')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  status(@Param('code') code: string, @Param('guestId', Uuid) guestId: string, @Body() dto: GuestStatusDto) {
    return this.meetings.guestStatus(code, guestId, dto.secret);
  }
}
