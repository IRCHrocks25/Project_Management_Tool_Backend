import { KANBAN_COLUMNS, getTaskColumn } from './task-kanban-column';

// This spec mirrors the frontend contract at
// frontend/src/utils/taskKanbanColumn.test.ts. If a fixture is added or
// changed here it MUST be added or changed in the frontend test too —
// otherwise the two getTaskColumn implementations have drifted and the
// Tuesday view will show different columns than its underlying data.

describe('KANBAN_COLUMNS', () => {
  it('exposes 8 canonical columns including Elliot Review', () => {
    expect(KANBAN_COLUMNS.map((c) => c.id)).toEqual([
      'not_started',
      'owned_in_progress',
      'for_approval',
      'revision',
      'elliot_review',
      'approved_completed',
      'qa_before_client',
      'client_validation',
    ]);
  });

  it('every column has id, label, and color', () => {
    for (const c of KANBAN_COLUMNS) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe('getTaskColumn (server mirror of frontend helper)', () => {
  it('completed task -> approved_completed', () => {
    expect(getTaskColumn({ status: 'In Progress', isCompleted: true }).id).toBe('approved_completed');
    expect(getTaskColumn({ status: 'Completed' }).id).toBe('approved_completed');
    expect(getTaskColumn({ status: 'Completed', assignedToId: 'u1' }).id).toBe('approved_completed');
  });

  it('description marker wins over enum status (Revision)', () => {
    expect(getTaskColumn({ status: 'In Review', description: 'foo\n\n--- Column: Revision ---' }).id).toBe('revision');
  });

  it('description markers map to expected columns', () => {
    expect(getTaskColumn({ status: 'In Review', description: '\n\n--- Column: Elliot Review ---' }).id).toBe('elliot_review');
    expect(getTaskColumn({ status: 'In Review', description: '\n\n--- Column: QA Review ---' }).id).toBe('qa_before_client');
    expect(getTaskColumn({ status: 'In Review', description: '\n\n--- Column: Client Validation ---' }).id).toBe('client_validation');
    expect(getTaskColumn({ status: 'In Review', description: '\n\n--- Column: Client Review ---' }).id).toBe('client_validation');
    expect(getTaskColumn({ status: 'In Review', description: '\n\n--- Column: For Approval ---' }).id).toBe('for_approval');
  });

  it('assigned + In Progress -> owned_in_progress', () => {
    expect(getTaskColumn({ status: 'In Progress', assignedToId: 'u1' }).id).toBe('owned_in_progress');
  });

  it('assigned + In Review (no marker) -> for_approval', () => {
    expect(getTaskColumn({ status: 'In Review', assignedToId: 'u1' }).id).toBe('for_approval');
  });

  it('assigned + legacy Revision / Needs Revision -> revision', () => {
    expect(getTaskColumn({ status: 'Revision', assignedToId: 'u1' }).id).toBe('revision');
    expect(getTaskColumn({ status: 'Needs Revision', assignedToId: 'u1' }).id).toBe('revision');
  });

  it('assigned + Elliot Review (legacy) -> elliot_review', () => {
    expect(getTaskColumn({ status: 'Elliot Review', assignedToId: 'u1' }).id).toBe('elliot_review');
  });

  it('assigned + QA / QA Review -> qa_before_client', () => {
    expect(getTaskColumn({ status: 'QA Review', assignedToId: 'u1' }).id).toBe('qa_before_client');
    expect(getTaskColumn({ status: 'QA', assignedToId: 'u1' }).id).toBe('qa_before_client');
  });

  it('assigned + Client Review / Client Validation -> client_validation', () => {
    expect(getTaskColumn({ status: 'Client Review', assignedToId: 'u1' }).id).toBe('client_validation');
    expect(getTaskColumn({ status: 'Client Validation', assignedToId: 'u1' }).id).toBe('client_validation');
  });

  it('assigned + Todo (no other signal) -> owned_in_progress', () => {
    expect(getTaskColumn({ status: 'Todo', assignedToId: 'u1' }).id).toBe('owned_in_progress');
  });

  it('unassigned + Todo -> not_started', () => {
    expect(getTaskColumn({ status: 'Todo' }).id).toBe('not_started');
  });

  it('unassigned with no signals -> not_started (fallback)', () => {
    expect(getTaskColumn({}).id).toBe('not_started');
  });

  it('null/undefined description is safe', () => {
    expect(getTaskColumn({ status: 'In Progress', assignedToId: 'u1', description: null }).id).toBe('owned_in_progress');
    expect(getTaskColumn({ status: 'In Progress', assignedToId: 'u1', description: undefined }).id).toBe('owned_in_progress');
  });

  it('isCompleted beats every marker', () => {
    expect(getTaskColumn({ status: 'In Review', isCompleted: true, description: '--- Column: Revision ---' }).id).toBe('approved_completed');
  });

  it('Revision marker resolves before Elliot Review when both present', () => {
    const desc = '\n\n--- Column: Revision ---\n\n--- Column: Elliot Review ---';
    expect(getTaskColumn({ status: 'In Review', description: desc }).id).toBe('revision');
  });
});
