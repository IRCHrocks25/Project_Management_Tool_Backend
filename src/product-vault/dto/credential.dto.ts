import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CredentialEnvironment } from '../entities/product-credential.entity';

const ENV_MESSAGE = 'Environment must be production, staging or demo.';
const URL_MESSAGE = 'Login URL must be a full web address, like https://app.example.com/login.';
const URL_OPTIONS = { require_protocol: true, protocols: ['http', 'https'], require_tld: false };

export class CreateCredentialDto {
  @IsString()
  @IsNotEmpty({ message: 'Give this login a name, like "Admin panel".' })
  @MaxLength(160, { message: 'Name must be 160 characters or fewer.' })
  label: string;

  @IsEnum(CredentialEnvironment, { message: ENV_MESSAGE })
  environment: CredentialEnvironment;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(500)
  loginUrl?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'Username or email is required.' })
  @MaxLength(255, { message: 'Username must be 255 characters or fewer.' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  @MaxLength(4000, { message: 'Password must be 4000 characters or fewer.' })
  secret: string;

  @IsBoolean({ message: 'Shareable must be true or false.' })
  shareable: boolean;
}

export class UpdateCredentialDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MaxLength(160, { message: 'Name must be 160 characters or fewer.' })
  label?: string;

  @IsOptional()
  @IsEnum(CredentialEnvironment, { message: ENV_MESSAGE })
  environment?: CredentialEnvironment;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(500)
  loginUrl?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @MaxLength(255, { message: 'Username must be 255 characters or fewer.' })
  username?: string;

  /** Only re-encrypted when given. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Password cannot be empty. Leave it out to keep the current one.' })
  @MaxLength(4000, { message: 'Password must be 4000 characters or fewer.' })
  secret?: string;

  @IsOptional()
  @IsBoolean({ message: 'Shareable must be true or false.' })
  shareable?: boolean;
}

export class RevealCredentialDto {
  @IsIn(['reveal', 'copy'], { message: 'Purpose must be "reveal" or "copy".' })
  purpose: 'reveal' | 'copy';
}

export class CreateShareDto {
  @IsIn(['1h', '24h', '7d'], { message: 'Expiry must be 1h, 24h or 7d.' })
  expiresIn: '1h' | '24h' | '7d';

  @IsBoolean({ message: 'One-time must be true or false.' })
  oneTime: boolean;
}
