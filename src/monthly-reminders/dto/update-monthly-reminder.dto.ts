import { IsInt, IsOptional, IsString, Max, Min, IsUUID } from 'class-validator';

export class UpdateMonthlyReminderDto {
  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  reminderDay?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  reminderLink?: string;

  @IsOptional()
  @IsString()
  currentMonthKey?: string | null;

  @IsOptional()
  @IsString()
  currentMonthStatus?: 'pending' | 'done' | 'no';

  @IsOptional()
  @IsString()
  nextMonthStatus?: 'pending' | 'done' | 'no' | null;
}
