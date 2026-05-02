import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BoardViewService, BoardViewSort } from './board-view.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const VALID_SORT_COLUMNS = new Set(['name', 'priority', 'timeline', 'pm', 'status']);
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

@Controller('board-view')
@UseGuards(JwtAuthGuard)
export class BoardViewController {
  constructor(private readonly boardViewService: BoardViewService) {}

  @Get()
  async getBoardView(
    @Query('projectId') projectId?: string,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('q') q?: string,
    @Query('dept') deptStr?: string,
    @Query('pm') pmStr?: string,
    @Query('status') statusStr?: string,
    @Query('priority') priorityStr?: string,
    @Query('assignee') assigneeStr?: string,
    @Query('sort') sortStr?: string,
  ) {
    const page = clampPositiveInt(pageStr, 1);
    const requestedPageSize = clampPositiveInt(pageSizeStr, DEFAULT_PAGE_SIZE);
    if (requestedPageSize > MAX_PAGE_SIZE) {
      throw new BadRequestException(`pageSize must be <= ${MAX_PAGE_SIZE}`);
    }

    const sort = parseSort(sortStr);

    return this.boardViewService.getBoardView({
      page,
      pageSize: requestedPageSize,
      projectId,
      search: q,
      dept: parseCsv(deptStr),
      pm: parseCsv(pmStr),
      status: parseCsv(statusStr),
      priority: parseCsv(priorityStr),
      assignee: parseCsv(assigneeStr),
      sort,
    });
  }
}

function clampPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function parseCsv(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

function parseSort(raw: string | undefined): BoardViewSort | undefined {
  if (!raw) return undefined;
  const [columnRaw, directionRaw] = raw.split(':');
  const column = (columnRaw || '').trim();
  const direction = (directionRaw || '').trim();

  if (column === 'department') {
    throw new BadRequestException('Department cannot be sorted at the project level.');
  }
  if (!VALID_SORT_COLUMNS.has(column)) {
    throw new BadRequestException(
      `Invalid sort column: '${column}'. Allowed: ${Array.from(VALID_SORT_COLUMNS).join(', ')}.`,
    );
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw new BadRequestException(`Invalid sort direction: '${direction}'. Allowed: asc, desc.`);
  }
  return { column: column as BoardViewSort['column'], direction };
}
