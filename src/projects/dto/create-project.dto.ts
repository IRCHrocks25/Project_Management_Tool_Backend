import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  IsDateString,
} from 'class-validator';
import { ClientType, PackageType, Priority } from '../entities/project.entity';

export class CreateProjectDto {
  @IsNotEmpty()
  @IsString()
  clientName: string;

  @IsNotEmpty()
  @IsEnum(ClientType)
  clientType: ClientType;

  @IsNotEmpty()
  @IsEnum(PackageType)
  package: PackageType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customDeliverables?: string[]; // Array of deliverable types when package is Custom

  @IsNotEmpty()
  @IsEnum(Priority)
  priority: Priority;

  @IsNotEmpty()
  @IsUUID()
  pmId: string;

  @IsNotEmpty()
  @IsString()
  targetCloseMonth: string; // Format: "2024-03"

  @IsOptional()
  @IsDateString()
  clientStartDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ClientType, { each: true })
  secondaryClientTypes?: ClientType[];
}
