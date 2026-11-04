import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProductUpdateType } from '../entities/product-update.entity';

const TYPES = Object.values(ProductUpdateType);
const TYPE_MESSAGE = `Type must be one of: ${TYPES.join(', ')}.`;

export class CreateUpdateDto {
  @IsIn(TYPES, { message: TYPE_MESSAGE })
  type: ProductUpdateType;

  @IsString()
  @IsNotEmpty({ message: 'Write something for the update.' })
  @MaxLength(20000, { message: 'The update is too long (max 20,000 characters).' })
  body: string;
}

export class EditUpdateDto {
  @IsOptional()
  @IsIn(TYPES, { message: TYPE_MESSAGE })
  type?: ProductUpdateType;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'The update cannot be empty.' })
  @MaxLength(20000, { message: 'The update is too long (max 20,000 characters).' })
  body?: string;
}

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'Write a reply first.' })
  @MaxLength(10000, { message: 'The reply is too long (max 10,000 characters).' })
  body: string;
}

export class UploadFilesDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120, { message: 'The folder name can be at most 120 characters.' })
  folder?: string;
}
