import { IsNotEmpty, IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateTaskQuestionDto {
  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  mentionedUserIds?: string[];
}

