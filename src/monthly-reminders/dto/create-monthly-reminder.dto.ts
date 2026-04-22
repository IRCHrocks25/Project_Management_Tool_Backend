import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  IsUUID,
} from 'class-validator';

export class CreateMonthlyReminderDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(31)
  reminderDay: number;

  @IsNotEmpty()
  @IsString()
  note: string;
}

