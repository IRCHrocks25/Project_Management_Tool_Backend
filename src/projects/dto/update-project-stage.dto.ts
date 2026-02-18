import { IsEnum, IsNotEmpty } from 'class-validator';
import { ProjectStage } from '../entities/project.entity';

export class UpdateProjectStageDto {
  @IsNotEmpty()
  @IsEnum(ProjectStage)
  stage: ProjectStage;
}

