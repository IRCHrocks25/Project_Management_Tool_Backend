import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';

export class DailyFocusItemInputDto {
  @IsString()
  departmentKey: string;

  @IsString()
  taskId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  rank: number;
}

export class UpdateDailyFocusDto {
  /** YYYY-MM-DD */
  @IsString()
  date: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DailyFocusItemInputDto)
  items: DailyFocusItemInputDto[];
}
