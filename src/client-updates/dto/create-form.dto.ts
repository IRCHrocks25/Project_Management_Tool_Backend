import {
  IsNotEmpty,
  IsUUID,
  IsArray,
  ValidateNested,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormBlockType } from '../entities/client-update-form.entity';

export class FormBlockDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsEnum(FormBlockType)
  type: FormBlockType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageAlt?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  bold?: boolean;

  @IsOptional()
  layout?: {
    columns: number;
    blocks: FormBlockDto[];
  };
}

export class CreateFormDto {
  @IsNotEmpty()
  @IsUUID()
  updateId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormBlockDto)
  blocks: FormBlockDto[];
}
