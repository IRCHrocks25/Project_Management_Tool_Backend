import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SopStepLinkKind } from '../entities/product-sop-step.entity';

const LINK_KINDS: SopStepLinkKind[] = ['url', 'tab', 'credential', 'file'];

export class SopStepLinkDto {
  @IsIn(LINK_KINDS, { message: 'A step link kind must be one of: url, tab, credential, file.' })
  kind: SopStepLinkKind;

  @IsString()
  @IsNotEmpty({ message: 'A step link needs a ref (the url, tab, credential or file id).' })
  @MaxLength(2000)
  ref: string;

  @IsString()
  @IsNotEmpty({ message: 'A step link needs a label.' })
  @MaxLength(200)
  label: string;
}

export class SopStepInputDto {
  /** Existing step id to keep (and its progress). Omit for a new step. */
  @IsOptional()
  @IsUUID(undefined, { message: 'A step id must be a uuid.' })
  id?: string;

  @IsString()
  @IsNotEmpty({ message: 'Every step needs some text.' })
  text: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'A step can have at most 20 links.' })
  @ValidateNested({ each: true })
  @Type(() => SopStepLinkDto)
  links?: SopStepLinkDto[];
}

export class CreateSopStepDto {
  @IsString()
  @IsNotEmpty({ message: 'Every step needs some text.' })
  text: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'A step can have at most 20 links.' })
  @ValidateNested({ each: true })
  @Type(() => SopStepLinkDto)
  links?: SopStepLinkDto[];
}

export class CreateProductSopDto {
  @IsString()
  @IsNotEmpty({ message: 'Give the SOP a title.' })
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'The audience can be at most 200 characters.' })
  audience?: string | null;

  @IsUUID(undefined, { message: 'Choose an owner for the SOP.' })
  ownerId: string;

  @IsArray({ message: 'Add at least one step.' })
  @ArrayMinSize(1, { message: 'Add at least one step.' })
  @ArrayMaxSize(200, { message: 'An SOP can have at most 200 steps.' })
  @ValidateNested({ each: true })
  @Type(() => CreateSopStepDto)
  steps: CreateSopStepDto[];
}

export class UpdateProductSopDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'The title cannot be empty.' })
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'The audience can be at most 200 characters.' })
  audience?: string | null;

  @IsOptional()
  @IsUUID(undefined, { message: 'The owner must be a user id.' })
  ownerId?: string;

  /** Replaces the whole list. Steps with a known id keep their id and progress. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'An SOP needs at least one step.' })
  @ArrayMaxSize(200, { message: 'An SOP can have at most 200 steps.' })
  @ValidateNested({ each: true })
  @Type(() => SopStepInputDto)
  steps?: SopStepInputDto[];
}

export class SetSopStepProgressDto {
  @IsBoolean({ message: 'done must be true or false.' })
  done: boolean;
}
