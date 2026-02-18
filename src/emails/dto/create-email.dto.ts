import { IsNotEmpty, IsString, IsEmail, IsUUID } from 'class-validator';

export class CreateEmailDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsNotEmpty()
  @IsEmail()
  recipientEmail: string;

  @IsNotEmpty()
  @IsUUID()
  projectId: string;
}

