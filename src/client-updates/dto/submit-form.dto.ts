import { IsNotEmpty, IsArray, ValidateNested, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmissionResponseDto {
  @IsNotEmpty()
  @IsString()
  blockId: string;

  @IsNotEmpty()
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class SubmitFormDto {
  @IsNotEmpty()
  @IsUUID()
  formId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionResponseDto)
  responses: SubmissionResponseDto[];

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;
}

