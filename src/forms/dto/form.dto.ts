import { Transform } from 'class-transformer';
import { IsArray, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFormDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title?: string;

  /** Copy this template (or any form) instead of starting blank. */
  @IsOptional()
  @IsUUID(undefined, { message: 'Pick a valid template.' })
  fromTemplateId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Pick a valid project.' })
  projectId?: string;
}

/**
 * Every field is optional so the builder can autosave just what changed.
 * `items` and `settings` are checked in depth by forms.logic.ts; `projectId: null` unlinks the project.
 */
export class UpdateFormDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'The description can be at most 5000 characters.' })
  description?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'Pick a valid project.' })
  projectId?: string | null;

  @IsOptional()
  @IsArray({ message: 'Items must be a list.' })
  items?: unknown[];

  @IsOptional()
  @IsObject({ message: 'Settings are not valid.' })
  settings?: Record<string, unknown>;
}

/** A public submission; checked against the form in forms.logic.ts validateSubmission. */
export class SubmitFormDto {
  @IsArray({ message: 'Answers must be a list.' })
  answers: unknown[];

  @IsOptional()
  @IsString()
  respondentName?: string;

  @IsOptional()
  @IsString()
  respondentEmail?: string;
}
