import { IsOptional, IsString, IsEnum, IsArray, IsUUID } from 'class-validator';
import { ClientType } from '../entities/project.entity';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

  @IsOptional()
  @IsArray()
  @IsEnum(ClientType, { each: true })
  secondaryClientTypes?: ClientType[];

  @IsOptional()
  @IsUUID()
  pmId?: string;
}

