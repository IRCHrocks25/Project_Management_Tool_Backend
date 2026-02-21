import { IsEnum, IsNotEmpty, IsString, IsOptional, IsUUID, IsArray, IsEmail } from 'class-validator';
import { ClientType, PackageType, Priority } from '../entities/project.entity';

export class CreateProjectWebhookDto {
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

  @IsOptional()
  @IsUUID()
  pmId?: string; // Optional - will use webhook PM account if not provided

  @IsNotEmpty()
  @IsString()
  targetCloseMonth: string; // Format: "2024-03"

  @IsOptional()
  @IsString()
  notes?: string;

  // Optional email metadata for tracking
  @IsOptional()
  @IsEmail()
  sourceEmail?: string;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ClientType, { each: true })
  secondaryClientTypes?: ClientType[];
}

