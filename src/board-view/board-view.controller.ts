import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { BoardViewService, BoardViewSort } from './board-view.service';
import { ProjectBoardService, BoardColumnInput } from './project-board.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const VALID_SORT_COLUMNS = new Set(['name', 'priority', 'timeline', 'pm', 'status']);
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

@Controller('board-view')
@UseGuards(JwtAuthGuard)
export class BoardViewController {
  constructor(
    private readonly boardViewService: BoardViewService,
    private readonly projectBoardService: ProjectBoardService,
  ) {}

  @Get('projects')
  listBoards() {
    return this.projectBoardService.listBoards();
  }

  @Get('projects/:id')
  getProjectBoard(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectBoardService.getBoard(id);
  }

  @Post('projects/:id/columns')
  addColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BoardColumnInput,
    @Request() req: any,
  ) {
    return this.projectBoardService.addColumn(id, body, req.user.userId);
  }

  @Put('projects/:id/columns/order')
  reorderColumns(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { columnIds: string[] },
    @Request() req: any,
  ) {
    return this.projectBoardService.reorderColumns(id, body?.columnIds, req.user.userId);
  }

  @Patch('projects/:id/columns/:columnId')
  updateColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() body: Partial<BoardColumnInput>,
    @Request() req: any,
  ) {
    return this.projectBoardService.updateColumn(id, columnId, body, req.user.userId);
  }

  @Delete('projects/:id/columns/:columnId')
  deleteColumn(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Request() req: any,
  ) {
    return this.projectBoardService.deleteColumn(id, columnId, req.user.userId);
  }

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
