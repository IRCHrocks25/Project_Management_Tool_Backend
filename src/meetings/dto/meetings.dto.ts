import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_INVITEES = 50;

export class CreateMeetingDto {
  @IsString({ message: 'Give the meeting a title.' })
  @IsNotEmpty({ message: 'Give the meeting a title.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Notes must be text.' })
  @MaxLength(4000, { message: 'Notes must be 4,000 characters or fewer.' })
  notes?: string | null;

  /** Leave out to start now. */
  @IsOptional()
  @IsDateString({}, { message: 'Choose a valid start time.' })
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Length must be a whole number of minutes.' })
  @Min(5, { message: 'A meeting must be at least 5 minutes.' })
  @Max(480, { message: 'A meeting can be at most 8 hours.' })
  durationMinutes?: number;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid project.' })
  projectId?: string | null;

  @IsOptional()
  @IsArray({ message: 'Choose who to invite.' })
  @ArrayMaxSize(MAX_INVITEES, { message: `You can invite up to ${MAX_INVITEES} people.` })
  @IsUUID('all', { each: true, message: 'Choose who to invite.' })
  inviteeIds?: string[];
}

export class UpdateMeetingDto {
  @IsOptional()
  @IsString({ message: 'Give the meeting a title.' })
  @IsNotEmpty({ message: 'Give the meeting a title.' })
  @MaxLength(200, { message: 'Title must be 200 characters or fewer.' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Notes must be text.' })
  @MaxLength(4000, { message: 'Notes must be 4,000 characters or fewer.' })
  notes?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'Choose a valid start time.' })
  startsAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Length must be a whole number of minutes.' })
  @Min(5, { message: 'A meeting must be at least 5 minutes.' })
  @Max(480, { message: 'A meeting can be at most 8 hours.' })
  durationMinutes?: number;

  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid project.' })
  projectId?: string | null;

  @IsOptional()
  @IsArray({ message: 'Choose who to invite.' })
  @ArrayMaxSize(MAX_INVITEES, { message: `You can invite up to ${MAX_INVITEES} people.` })
  @IsUUID('all', { each: true, message: 'Choose who to invite.' })
  inviteeIds?: string[];
}

export class GuestLinkDto {
  @IsOptional()
  @IsBoolean({ message: 'Turn the guest link on or off.' })
  enabled?: boolean;

  /** True makes a new link and stops the old one working. */
  @IsOptional()
  @IsBoolean({ message: 'Turn the guest link on or off.' })
  regenerate?: boolean;
}

export class GuestDecisionDto {
  @IsIn(['admit', 'deny'], { message: 'Admit or deny this guest.' })
  decision: 'admit' | 'deny';
}

export class AskToJoinDto {
  @IsString({ message: 'Enter your name.' })
  @IsNotEmpty({ message: 'Enter your name.' })
  @MaxLength(80, { message: 'Name must be 80 characters or fewer.' })
  name: string;
}

export class GuestStatusDto {
  @IsString({ message: 'That link is not valid.' })
  @IsNotEmpty({ message: 'That link is not valid.' })
  @MaxLength(128, { message: 'That link is not valid.' })
  secret: string;
}
