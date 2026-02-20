import { IsNotEmpty, IsString, IsEmail, IsUUID, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateEmailDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? '' : value))
  body?: string;

  @IsNotEmpty()
  @IsEmail()
  recipientEmail: string;

  @IsNotEmpty()
  @IsUUID()
  projectId: string;
}

