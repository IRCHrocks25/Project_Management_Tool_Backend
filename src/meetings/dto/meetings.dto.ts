import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
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

export class ParticipantActionDto {
  @IsString({ message: 'Choose someone in the call.' })
  @Matches(/^(user|guest):[0-9a-f-]{36}$/i, { message: 'Choose someone in the call.' })
  identity: string;
}

export const MAX_RECORDING_BYTES = 8 * 1024 * 1024 * 1024;

export class StopRecordingDto {
  @Type(() => Number)
  @IsInt({ message: 'Length must be a whole number of seconds.' })
  @Min(0, { message: 'Length must be a whole number of seconds.' })
  @Max(86400, { message: 'A recording can be at most 24 hours.' })
  durationSeconds: number;
}

export class BeginRecordingUploadDto {
  @IsString({ message: 'Only video recordings can be saved.' })
  @Matches(/^video\/(webm|mp4)(;|$)/, { message: 'Only video recordings can be saved.' })
  @MaxLength(80, { message: 'Only video recordings can be saved.' })
  contentType: string;

  @Type(() => Number)
  @IsInt({ message: 'That recording is empty.' })
  @Min(1, { message: 'That recording is empty.' })
  @Max(MAX_RECORDING_BYTES, { message: 'That recording is too large to save.' })
  sizeBytes: number;
}

export class RecordingPartDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  etag: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  size: number;
}

export class CompleteRecordingDto {
  @IsArray({ message: 'The upload is incomplete.' })
  @ArrayMinSize(1, { message: 'The upload is incomplete.' })
  @ArrayMaxSize(10000, { message: 'The upload is too large.' })
  @ValidateNested({ each: true })
  @Type(() => RecordingPartDto)
  parts: RecordingPartDto[];
}
