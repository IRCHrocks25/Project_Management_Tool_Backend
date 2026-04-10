import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { OnboardingPhase, OnboardingPhaseStatus } from '../entities/project.entity';

export class UpdateOnboardingPhaseDto {
  @IsOptional()
  @IsEnum(OnboardingPhase)
  phase?: OnboardingPhase;

  @IsOptional()
  @IsEnum(OnboardingPhaseStatus)
  status?: OnboardingPhaseStatus;

  @IsOptional()
  @IsString()
  milestoneKey?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @IsOptional()
  @IsBoolean()
  markCurrentMilestoneComplete?: boolean;

  @IsOptional()
  @IsBoolean()
  advanceToNextPhase?: boolean;

  @IsOptional()
  @IsUUID()
  onboardingManagerId?: string;

  @IsOptional()
  @IsUUID()
  automationSpecialistId?: string;

  @IsOptional()
  @IsUUID()
  qaSpecialistId?: string;
}
