import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordOtpDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'The code must be exactly 6 digits' })
  otp: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}
