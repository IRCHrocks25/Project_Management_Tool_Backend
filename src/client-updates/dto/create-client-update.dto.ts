import { IsNotEmpty, IsUUID, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateClientUpdateDto {
  @IsNotEmpty()
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  links?: string[];
}

