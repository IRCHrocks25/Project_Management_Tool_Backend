import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateDriveItemDto {
  @IsIn(['folder', 'doc', 'grid', 'slides'])
  kind: 'folder' | 'doc' | 'grid' | 'slides';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  preview?: Record<string, unknown>;
}

export class UpdateDriveItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  preview?: Record<string, unknown>;

  /** Required with content: a save based on an older revision answers 409. */
  @IsOptional()
  @IsInt()
  @Min(1)
  revision?: number;
}

export class DriveShareDto {
  @IsIn(['everyone', 'department', 'user'])
  kind: 'everyone' | 'department' | 'user';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  target?: string | null;

  @IsIn(['view', 'comment', 'edit'])
  permission: 'view' | 'comment' | 'edit';
}

export class SetDriveSharesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DriveShareDto)
  shares: DriveShareDto[];
}

export class StarDriveItemDto {
  @IsBoolean()
  starred: boolean;
}
