import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateClientUpdateDto {
  @IsNotEmpty()
  @IsUUID()
  projectId: string;
}

