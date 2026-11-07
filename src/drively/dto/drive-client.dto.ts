import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const SIX_DIGITS = /^\d{6}$/;
const SIX_DIGITS_MESSAGE = 'Your code needs exactly 6 digits.';
const blankToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && !value.trim() ? undefined : value);

export class ClaimClientLinkDto {
  /** Required for a new client. A link that sets a new code already knows who it's for. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsEmail({}, { message: "That email doesn't look right." })
  @MaxLength(255)
  email?: string;

  @IsString()
  @Matches(SIX_DIGITS, { message: SIX_DIGITS_MESSAGE })
  code: string;
}

export class ClientSignInDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(SIX_DIGITS, { message: SIX_DIGITS_MESSAGE })
  code: string;
}

export class ClientForgotCodeDto {
  @IsEmail({}, { message: "That email doesn't look right." })
  @MaxLength(255)
  email: string;
}

export class ClientResetCodeDto {
  @IsEmail({}, { message: "That email doesn't look right." })
  @MaxLength(255)
  email: string;

  @IsString()
  @Matches(SIX_DIGITS, { message: 'The reset code from your email has 6 digits.' })
  resetCode: string;

  @IsString()
  @Matches(SIX_DIGITS, { message: SIX_DIGITS_MESSAGE })
  code: string;
}

export class ShareWithClientDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsIn(['view', 'comment'])
  permission?: 'view' | 'comment';
}
