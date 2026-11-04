import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DemoAssetStatus } from '../entities/product-demo-account.entity';

const STATUS_MESSAGE = 'Status must be not_started, in_progress, done or not_needed.';

export class CreateDemoAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Client name is required.' })
  @MaxLength(160, { message: 'Client name must be 160 characters or fewer.' })
  clientName: string;

  @IsEmail({}, { message: 'Login email must be a valid email address.' })
  @MaxLength(255)
  loginEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Purpose must be 2000 characters or fewer.' })
  purpose?: string | null;

  @IsUUID(undefined, { message: 'Choose an owner for this demo account.' })
  ownerId: string;

  @IsEnum(DemoAssetStatus, { message: `Avatar ${STATUS_MESSAGE.toLowerCase()}` })
  avatarStatus: DemoAssetStatus;

  @IsEnum(DemoAssetStatus, { message: `Transcript ${STATUS_MESSAGE.toLowerCase()}` })
  transcriptStatus: DemoAssetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: 'Password must be 4000 characters or fewer.' })
  password?: string;

  @IsOptional()
  @IsBoolean({ message: 'Save password must be true or false.' })
  savePassword?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID(undefined, { message: 'Credential must be a vault item id.' })
  credentialId?: string | null;
}

export class UpdateDemoAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Client name cannot be empty.' })
  @MaxLength(160, { message: 'Client name must be 160 characters or fewer.' })
  clientName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Login email must be a valid email address.' })
  @MaxLength(255)
  loginEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Purpose must be 2000 characters or fewer.' })
  purpose?: string | null;

  @IsOptional()
  @IsUUID(undefined, { message: 'Owner must be a user id.' })
  ownerId?: string;

  @IsOptional()
  @IsEnum(DemoAssetStatus, { message: `Avatar ${STATUS_MESSAGE.toLowerCase()}` })
  avatarStatus?: DemoAssetStatus;

  @IsOptional()
  @IsEnum(DemoAssetStatus, { message: `Transcript ${STATUS_MESSAGE.toLowerCase()}` })
  transcriptStatus?: DemoAssetStatus;

  /** null unlinks the vault item. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID(undefined, { message: 'Credential must be a vault item id.' })
  credentialId?: string | null;
}
