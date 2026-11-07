import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { MAX_COMMENT_LENGTH } from '../drive-comment.logic';

export class CreateCommentDto {
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  anchor?: Record<string, unknown> | null;

  /** Team members only. A client's thread is always visible to clients. */
  @IsOptional()
  @IsBoolean()
  showToClients?: boolean;
}

export class UpdateCommentDto {
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  body: string;
}

export class ResolveCommentDto {
  @IsBoolean()
  resolved: boolean;
}

export class ClientPermissionDto {
  @IsIn(['view', 'comment'])
  permission: 'view' | 'comment';
}

export class OptionalClientPermissionDto {
  @IsOptional()
  @IsIn(['view', 'comment'])
  permission?: 'view' | 'comment';
}
