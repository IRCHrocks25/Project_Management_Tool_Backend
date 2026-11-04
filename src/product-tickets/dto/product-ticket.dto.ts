import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  ProductTicketPriority,
  ProductTicketStatus,
  ProductTicketType,
} from '../entities/product-ticket.entity';

export class CreateProductTicketDto {
  @IsString()
  @IsNotEmpty({ message: 'Give the ticket a title.' })
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title: string;

  @IsEnum(ProductTicketType, { message: 'Type must be one of: bug, feature, request, task.' })
  type: ProductTicketType;

  @IsEnum(ProductTicketPriority, { message: 'Priority must be one of: high, medium, low.' })
  priority: ProductTicketPriority;

  @IsOptional()
  @IsUUID(undefined, { message: 'assigneeId must be a user id.' })
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateProductTicketDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'The title cannot be empty.' })
  @MaxLength(200, { message: 'The title can be at most 200 characters.' })
  title?: string;

  @IsOptional()
  @IsEnum(ProductTicketType, { message: 'Type must be one of: bug, feature, request, task.' })
  type?: ProductTicketType;

  @IsOptional()
  @IsEnum(ProductTicketPriority, { message: 'Priority must be one of: high, medium, low.' })
  priority?: ProductTicketPriority;

  @IsOptional()
  @IsEnum(ProductTicketStatus, {
    message: 'Status must be one of: todo, in_progress, in_review, done.',
  })
  status?: ProductTicketStatus;

  /** null unassigns. */
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID(undefined, { message: 'assigneeId must be a user id or null.' })
  assigneeId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class ListProductTicketsQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'assigneeId must be a user id.' })
  assigneeId?: string;

  @IsOptional()
  @IsEnum(ProductTicketStatus, {
    message: 'Status must be one of: todo, in_progress, in_review, done.',
  })
  status?: ProductTicketStatus;

  @IsOptional()
  @IsString()
  q?: string;
}
