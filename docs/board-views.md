# Board views: a project as a table and a kanban

`/boards/:projectId` shows one project as a board. Deliverables are the groups and tasks are the rows. Nothing is
stored twice: stages, owners, files and updates are the same records every other board uses, so a task sits in the
same column everywhere.

## Setup

Run `npm run migrate:board-views` before deploying this code. It is safe to run again. Every query on tasks reads the
new columns, so tasks stop loading if the code goes out first.

## Fields added to tasks

- `priority`: Urgent, High, Medium, Low or empty. Separate from the project's own priority.
- `startDate`: with `dueDate` this makes the Timeline column. There is only one due date.
- `notes`: one short line shown in the table. The description and its history blocks are untouched.
- `customFields`: values for the columns a project adds, keyed by `board_columns.id`.

## Who can do what

- Every signed-in person sees every active project's board, the same as `/board-view`.
- Anyone can edit cells.
- Adding, renaming, reordering or deleting a column needs a PM, the CEO, a Head PM or a department head. Deleting a
  column also deletes its values on that project's tasks.

## Routes (all need a login)

- `GET /board-view/projects`: active projects for the board list.
- `GET /board-view/projects/:id`: groups, columns and tasks for one board.
- `POST /board-view/projects/:id/columns`, `PATCH` or `DELETE .../columns/:columnId`, `PUT .../columns/order`.
- `PATCH /tasks/:id/fields`: `priority`, `startDate`, `dueDate`, `notes`, `deliverableId`, `customFields`. Each change
  is written to the task's activity log with who made it, the old value and the new value.

Stage moves still use `PATCH /tasks/:id/status` plus the description marker, through `moveTaskToColumn` on the frontend.

## Status changes

On a board a status change is one click with no notes prompt. Moving an unowned task to Owned/In Progress assigns it to
whoever moved it. A task with an owner can't go back to Not yet started until the owner is removed, because the shared
stage rules would put it straight back in progress.
