import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminResetUserPasswordDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}
