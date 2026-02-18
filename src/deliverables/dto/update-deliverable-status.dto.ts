import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DeliverableStatus } from '../entities/deliverable.entity';

export class UpdateDeliverableStatusDto {
  @IsEnum(DeliverableStatus)
  status: DeliverableStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string; // Track which file is being approved/rejected
}

