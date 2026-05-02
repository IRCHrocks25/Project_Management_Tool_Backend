/*
 * Server-side mirror of frontend/src/utils/taskKanbanColumn.ts.
 *
 * IMPORTANT: this file MUST stay byte-for-byte equivalent in *behavior*
 * with the frontend version. The shared contract is the test fixture set
 * — frontend/src/utils/taskKanbanColumn.test.ts and the matching .spec
 * here are the only source of truth for cross-stack consistency.
 *
 * If you change this file, change the frontend file the same way and
 * re-run both test suites. See CLAUDE.md "Known Debt".
 */

export interface KanbanColumn {
  id: string;
  label: string;
  color: string;
}

export const KANBAN_COLUMNS: readonly KanbanColumn[] = [
  { id: 'not_started',        label: 'Not yet started',             color: '#6b7280' },
  { id: 'owned_in_progress',  label: 'Owned/In Progress',           color: '#3b82f6' },
  { id: 'for_approval',       label: 'For Approval',                color: '#f59e0b' },
  { id: 'revision',           label: 'Revision',                    color: '#ef4444' },
  { id: 'elliot_review',      label: 'Elliot Review',               color: '#8b5cf6' },
  { id: 'approved_completed', label: 'Approved/Completed',          color: '#10b981' },
  { id: 'qa_before_client',   label: 'QA Before Sending to Client', color: '#06b6d4' },
  { id: 'client_validation',  label: 'Client Validation',           color: '#f97316' },
];

const COLUMN_BY_ID: Record<string, KanbanColumn> = KANBAN_COLUMNS.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<string, KanbanColumn>,
);

const FALLBACK = COLUMN_BY_ID['not_started'];

export interface TaskShape {
  status?: string | null;
  isCompleted?: boolean | null;
  description?: string | null;
  assignedToId?: string | null;
}

export function getTaskColumn(task: TaskShape): KanbanColumn {
  if (task.isCompleted || task.status === 'Completed') {
    return COLUMN_BY_ID['approved_completed'];
  }

  const desc = task.description || '';

  if (desc.includes('--- Column: Revision ---'))         return COLUMN_BY_ID['revision'];
  if (desc.includes('--- Column: Elliot Review ---'))    return COLUMN_BY_ID['elliot_review'];
  if (desc.includes('--- Column: QA Review ---'))        return COLUMN_BY_ID['qa_before_client'];
  if (desc.includes('--- Column: Client Validation ---')) return COLUMN_BY_ID['client_validation'];
  if (desc.includes('--- Column: Client Review ---'))    return COLUMN_BY_ID['client_validation'];
  if (desc.includes('--- Column: For Approval ---'))     return COLUMN_BY_ID['for_approval'];

  if (task.assignedToId) {
    if (task.status === 'In Progress')                              return COLUMN_BY_ID['owned_in_progress'];
    if (task.status === 'In Review')                                return COLUMN_BY_ID['for_approval'];
    if (task.status === 'Revision' || task.status === 'Needs Revision') return COLUMN_BY_ID['revision'];
    if (task.status === 'Elliot Review')                            return COLUMN_BY_ID['elliot_review'];
    if (task.status === 'QA Review' || task.status === 'QA')        return COLUMN_BY_ID['qa_before_client'];
    if (task.status === 'Client Review' || task.status === 'Client Validation') return COLUMN_BY_ID['client_validation'];
    return COLUMN_BY_ID['owned_in_progress'];
  }

  return FALLBACK;
}
