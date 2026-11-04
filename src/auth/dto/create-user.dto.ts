import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

/** A Head PM or Founder adding a teammate. */
export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password: string;

  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;
}
