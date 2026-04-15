import { IsBoolean, IsNotEmpty } from 'class-validator';

export class SetUserAccessDto {
  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;
}

