import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

export class UpsertDepartmentProjectFocusDto {
  /** YYYY-MM-DD */
  @IsString()
  date: string;

  /** Same as task type key, e.g. Copy, Design, Dev */
  @IsString()
  departmentKey: string;

  /** Ordered list of task IDs (preferred). */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  taskIds?: string[];

  /** Ordered list of project IDs (legacy fallback). */
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  projectIds?: string[];
}
