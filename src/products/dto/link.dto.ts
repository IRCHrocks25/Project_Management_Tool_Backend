import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';
import { ProductLinkKind } from '../entities/product-link.entity';
import { URL_MESSAGE, URL_OPTIONS } from './product.dto';

const KINDS = Object.values(ProductLinkKind);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateLinkDto {
  @IsIn(KINDS, { message: `Kind must be one of: ${KINDS.join(', ')}.` })
  kind: ProductLinkKind;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Give the link a label.' })
  @MaxLength(120, { message: 'The label can be at most 120 characters.' })
  label: string;

  @Transform(trim)
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(1000)
  url: string;
}

export class UpdateLinkDto {
  @IsOptional()
  @IsIn(KINDS, { message: `Kind must be one of: ${KINDS.join(', ')}.` })
  kind?: ProductLinkKind;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'The label cannot be empty.' })
  @MaxLength(120, { message: 'The label can be at most 120 characters.' })
  label?: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(1000)
  url?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
