import { Transform } from 'class-transformer';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const domainTransform = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
    : value;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DOMAIN_MESSAGE = 'Enter a domain like courseforge.io.';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateDomainDto {
  @Transform(domainTransform)
  @Matches(DOMAIN_PATTERN, { message: DOMAIN_MESSAGE })
  domain: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  registrar?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  dnsProvider?: string;

  @IsNotEmpty({ message: 'Enter the date the domain renews.' })
  @Matches(DATE_PATTERN, { message: 'renewsOn must be a date like 2026-12-31.' })
  @IsISO8601({ strict: true }, { message: 'renewsOn must be a real date.' })
  renewsOn: string;

  @IsNotEmpty({ message: 'Enter the date the SSL certificate expires.' })
  @Matches(DATE_PATTERN, { message: 'sslExpiresOn must be a date like 2026-12-31.' })
  @IsISO8601({ strict: true }, { message: 'sslExpiresOn must be a real date.' })
  sslExpiresOn: string;
}

export class UpdateDomainDto {
  @IsOptional()
  @Transform(domainTransform)
  @Matches(DOMAIN_PATTERN, { message: DOMAIN_MESSAGE })
  domain?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  registrar?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  dnsProvider?: string | null;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'renewsOn must be a date like 2026-12-31.' })
  @IsISO8601({ strict: true }, { message: 'renewsOn must be a real date.' })
  renewsOn?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'sslExpiresOn must be a date like 2026-12-31.' })
  @IsISO8601({ strict: true }, { message: 'sslExpiresOn must be a real date.' })
  sslExpiresOn?: string;
}
