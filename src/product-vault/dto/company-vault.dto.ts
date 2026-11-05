import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

const URL_MESSAGE = 'Login URL must be a full web address, like https://app.example.com/login.';
const URL_OPTIONS = { require_protocol: true, protocols: ['http', 'https'], require_tld: false };
const tidy = ({ value }: { value: any }) => (typeof value === 'string' ? value.replace(/\0/g, '').trim() : value);

export class AccessDto {
  @IsBoolean({ message: 'Everyone must be true or false.' })
  everyone: boolean;

  @IsArray({ message: 'Departments must be a list.' })
  @ArrayMaxSize(50, { message: 'That is too many departments.' })
  @IsIn(Object.values(UserRole), { each: true, message: 'One of those departments does not exist.' })
  departments: string[];

  @IsArray({ message: 'People must be a list.' })
  @ArrayMaxSize(500, { message: 'That is too many people.' })
  @IsUUID(undefined, { each: true, message: 'One of those people is not a valid user.' })
  userIds: string[];
}

export class CreateVaultItemDto {
  @IsIn(['company', 'personal'], { message: 'Scope must be company or personal.' })
  scope: 'company' | 'personal';

  @Transform(tidy)
  @IsString({ message: 'Give this login a name, like "Gmail".' })
  @IsNotEmpty({ message: 'Give this login a name, like "Gmail".' })
  @MaxLength(160, { message: 'Name must be 160 characters or fewer.' })
  label: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(500, { message: 'Login URL must be 500 characters or fewer.' })
  loginUrl?: string | null;

  @Transform(tidy)
  @IsString({ message: 'Username or email is required.' })
  @IsNotEmpty({ message: 'Username or email is required.' })
  @MaxLength(255, { message: 'Username must be 255 characters or fewer.' })
  username: string;

  @IsString({ message: 'Password is required.' })
  @IsNotEmpty({ message: 'Password is required.' })
  @MaxLength(4000, { message: 'Password must be 4000 characters or fewer.' })
  secret: string;

  @IsOptional()
  @IsString({ message: 'Notes must be text.' })
  @MaxLength(4000, { message: 'Notes must be 4000 characters or fewer.' })
  notes?: string | null;

  /** Required for company, ignored for personal. */
  @ValidateIf((o) => o.scope === 'company')
  @IsDefined({ message: 'Choose who can see this login.' })
  @ValidateNested()
  @Type(() => AccessDto)
  access?: AccessDto;
}

export class UpdateVaultItemDto {
  @IsOptional()
  @Transform(tidy)
  @IsString({ message: 'Name must be text.' })
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MaxLength(160, { message: 'Name must be 160 characters or fewer.' })
  label?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(500, { message: 'Login URL must be 500 characters or fewer.' })
  loginUrl?: string | null;

  @IsOptional()
  @Transform(tidy)
  @IsString({ message: 'Username must be text.' })
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @MaxLength(255, { message: 'Username must be 255 characters or fewer.' })
  username?: string;

  /** Only re-encrypted when given. */
  @IsOptional()
  @IsString({ message: 'Password must be text.' })
  @IsNotEmpty({ message: 'Password cannot be empty. Leave it out to keep the current one.' })
  @MaxLength(4000, { message: 'Password must be 4000 characters or fewer.' })
  secret?: string;

  @IsOptional()
  @IsString({ message: 'Notes must be text.' })
  @MaxLength(4000, { message: 'Notes must be 4000 characters or fewer.' })
  notes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessDto)
  access?: AccessDto;
}
