import { IsOptional, IsString } from 'class-validator';

export class UpdateDeliverableDto {
  @IsOptional()
  @IsString()
  customType?: string;
}

