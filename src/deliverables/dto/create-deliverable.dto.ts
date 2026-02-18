import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { DeliverableType } from '../entities/deliverable.entity';

export class CreateDeliverableDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsEnum(DeliverableType)
  type: DeliverableType;

  @IsOptional()
  @IsString()
  customType?: string; // For custom deliverable names
}

