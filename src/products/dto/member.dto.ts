import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateMemberDto {
  @IsUUID(undefined, { message: 'Pick a person to add.' })
  userId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Say what area this person covers.' })
  @MaxLength(120, { message: 'The area can be at most 120 characters.' })
  area: string;

  @IsOptional()
  @IsString()
  askAbout?: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'The area cannot be empty.' })
  @MaxLength(120, { message: 'The area can be at most 120 characters.' })
  area?: string;

  @IsOptional()
  @IsString()
  askAbout?: string | null;
}
