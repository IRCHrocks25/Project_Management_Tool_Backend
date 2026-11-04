import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength } from 'class-validator';
import { ProductStatus } from '../entities/product.entity';

const STATUSES = Object.values(ProductStatus);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upperTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export const URL_OPTIONS = { require_protocol: true, require_tld: false, protocols: ['http', 'https'] };
export const URL_MESSAGE = 'Enter a full URL starting with http:// or https://.';

export class CreateProductDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Give the product a name.' })
  @MaxLength(120, { message: 'The name can be at most 120 characters.' })
  name: string;

  @IsOptional()
  @Transform(upperTrim)
  @Matches(/^[A-Z0-9]{2,5}$/, { message: 'The code must be 2–5 letters or digits, e.g. CF.' })
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(STATUSES, { message: `Status must be one of: ${STATUSES.join(', ')}.` })
  status: ProductStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40, { message: 'The version can be at most 40 characters.' })
  version?: string;

  @IsUUID(undefined, { message: 'Pick an owner for the product.' })
  ownerId: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(1000)
  productionUrl?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'The name cannot be empty.' })
  @MaxLength(120, { message: 'The name can be at most 120 characters.' })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(STATUSES, { message: `Status must be one of: ${STATUSES.join(', ')}.` })
  status?: ProductStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40, { message: 'The version can be at most 40 characters.' })
  version?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'ownerId must be a user id.' })
  ownerId?: string;
}
