import { IsNotEmpty, IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateChatRoomDto {
  @IsNotEmpty()
  @IsUUID()
  otherUserId: string; // For DM: the other person in the conversation
}
