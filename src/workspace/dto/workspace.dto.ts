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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const TITLE_MESSAGE = 'Title must be 200 characters or fewer.';

export class CreatePageDto {
  @IsOptional()
  @IsString({ message: 'Title must be text.' })
  @MaxLength(200, { message: TITLE_MESSAGE })
  title?: string;

  @IsOptional()
  @IsObject({ message: "That page content isn't a valid document." })
  content?: any;
}

export class UpdatePageDto extends CreatePageDto {
  @IsInt({ message: 'Revision must be a whole number.' })
  @Min(0, { message: 'Revision must be a whole number.' })
  revision: number;
}

export class PageShareDto {
  @IsIn(['everyone', 'department', 'user'], { message: 'Share with everyone, a department or a person.' })
  kind: 'everyone' | 'department' | 'user';

  @IsOptional()
  @IsString({ message: 'Choose who to share with.' })
  @MaxLength(255, { message: 'Choose who to share with.' })
  target?: string | null;

  @IsIn(['view', 'edit'], { message: 'Permission must be view or edit.' })
  permission: 'view' | 'edit';
}

export class SetPageSharesDto {
  @IsArray({ message: 'Shares must be a list.' })
  @ArrayMaxSize(500, { message: 'That is too many shares.' })
  @ValidateNested({ each: true })
  @Type(() => PageShareDto)
  shares: PageShareDto[];
}

export class ToggleChecklistDto {
  @IsInt({ message: 'Checklist position must be a whole number.' })
  @Min(0, { message: 'Checklist position must be a whole number.' })
  index: number;

  @IsString({ message: 'Checklist text is required.' })
  text: string;

  @IsBoolean({ message: 'Checked must be true or false.' })
  checked: boolean;
}
