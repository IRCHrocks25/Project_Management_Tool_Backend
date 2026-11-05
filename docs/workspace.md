# Workspace: Vault, Pages and My Day

The API contract for three features. The backend implements it, `src/services/workspace.service.ts` in the
frontend mirrors it. All routes need a login (`JwtAuthGuard`). `actor = { userId: req.user.userId, role: req.user.role }`.
Errors are short plain sentences, like the rest of the Hub.

## Audience

A department is a `UserRole` value, e.g. `Designer`. `FOUNDER/CEO` and `Project Manager` also count as roles here.

```ts
interface Access { everyone: boolean; departments: string[]; userIds: string[] }
```

## Vault (company and personal logins)

Stored in the existing `product_credentials` table so encryption, events and share links are reused:
`productId` becomes nullable and new columns are added (see migration).

- `scope`: `product` (existing rows, default), `company`, `personal`.
- `ownerId`: creator of a company or personal item.
- `notesEncrypted`: AES-GCM via `VaultCryptoService`, `select: false`.
- `accessEveryone boolean`, `accessDepartments text[]`, `accessUserIds uuid[]`.
- `passwordChangedAt`, `passwordChangedById`.
- New table `product_credential_versions`: old secrets kept for 30 days.
- `product_credential_shares` gets `internal boolean default false`. An internal link works even when
  `shareable` is false. Only the assistant creates these. `ACTIVE_SHARE_SQL` becomes `(c.shareable = true OR s.internal = true)`.
  `peekShare` and `openShare` LEFT JOIN products and fall back to the product name `Company vault`.

### Access rules (pure functions, unit tested, in `workspace-access.ts`)

| | personal | company |
|---|---|---|
| See, reveal, copy, update fields and password | owner only. FOUNDER/CEO and PM get **no** override | owner, FOUNDER/CEO, Project Manager, or matches `access` |
| Delete, change `access` (`canManage`) | owner only | owner, FOUNDER/CEO, Project Manager |

Anyone without access gets 404 on every route, so an item's existence isn't leaked. A person who can see a company
item but can't manage it gets 403 when they try to change `access` or delete.

### Routes

```
GET    /vault/items?scope=company|personal     -> VaultItem[] sorted by label; only items the actor can see
POST   /vault/items                            -> VaultItem   { scope, label, loginUrl?, username, secret, notes?, access? }
PATCH  /vault/items/:id                        -> VaultItem   { label?, loginUrl?, username?, secret?, notes?, access? }
DELETE /vault/items/:id                        -> { success: true }
POST   /vault/items/:id/reveal                 -> { secret }  { purpose: 'reveal'|'copy' }  Cache-Control: no-store; logs an event
GET    /vault/items/:id/events                 -> [{ id, action, detail, user, at }] latest 20
GET    /vault/items/:id/versions               -> [{ id, changedBy, createdAt, expiresAt }] unexpired only, newest first
POST   /vault/items/:id/versions/:vid/reveal   -> { secret }  no-store; logs an event
POST   /vault/items/:id/versions/:vid/restore  -> VaultItem   the current secret is itself saved as a version
```

```ts
interface VaultItem {
  id: string; scope: 'company' | 'personal'; label: string; loginUrl: string | null; username: string;
  notes: string | null;              // decrypted, only ever returned to people with access
  access: Access;                    // personal items always { everyone: false, departments: [], userIds: [] }
  createdBy: HubUser | null; updatedBy: HubUser | null; createdAt: string; updatedAt: string;
  passwordChangedAt: string | null; passwordChangedBy: HubUser | null;
  lastEvent: { action: string; user: HubUser | null; at: string } | null;
  canManage: boolean;
}
```

Validation: `label` 1–160, `loginUrl` same rule as `CreateCredentialDto`, `username` 1–255, `secret` 1–4000, `notes` up to 4000,
`departments` must be `UserRole` values, `userIds` UUIDs. `access` is required on create for company, ignored for personal.
A company item with nobody in `access` is allowed (only owner and admins see it).

Password or username changed on a company item: notify everyone with access except the actor. New enum value
`vault_updated`, `title: 'Gmail password changed'`, `message: 'Julia updated the password for Gmail.'`,
`link: '/vault?item=<id>'`. **Never put a secret or a note in a notification.** Inactive users (`isActive = false`) are skipped.
Personal items never notify. Purge expired versions when writing (no scheduler exists).

Writing a secret stores the previous ciphertext in `product_credential_versions`, in the same transaction.

### Assistant

Two read tools, not in `WRITE_TOOLS`: `list_company_logins` (labels and scope only, for what the actor can see) and
`create_company_login_link` (`{ itemId }`, one-time, 1h, `internal: true`, pushes a `vault_link` action; the model never
sees the URL). Add `/vault`, `/pages`, `/my-day` and `/pages/<uuid>` to `PAGE_PATTERNS` and the `open_page` description.

### Fix in the product vault

`GET products/:id/credentials/:credId/events` currently has no access check. Pass the actor and `assertCanReveal`.
`listCredentials` returns `lastEvent: null` for someone who can't reveal.

## Pages

Tables: `workspace_pages`, `workspace_page_shares`, `workspace_page_opens`. Migrations live in
`migrations/workspace-*.sql`, run by `scripts/create-workspace-tables.js` (`npm run migrate:workspace`), same as forms.

- `content` is TipTap JSON (`{ type: 'doc', content: [...] }`). `contentText` is extracted plain text for search.
- `revision int` guards against overlapping saves. `deletedAt` is a soft delete.
- Reject content over 1 MB, or that isn't `type: 'doc'`.

Access: owner has everything. A share gives `view` or `edit`; the strongest matching share wins. FOUNDER/CEO and PM get
**no** override on pages. No access: 404. Edit-level actions with only view: 403. Sharing, delete: owner only (403).

```
GET    /workspace/pages?view=mine|shared&q=    -> PageSummary[]  by updatedAt desc; q matches title or contentText
POST   /workspace/pages                        -> PageDetail     { title?, content? }  (empty title is stored as 'Untitled')
GET    /workspace/pages/:id                    -> PageDetail     records an open for My Day
PATCH  /workspace/pages/:id                    -> PageDetail     { revision, title?, content? }
DELETE /workspace/pages/:id                    -> { success: true }
POST   /workspace/pages/:id/duplicate          -> PageDetail     needs view; the copy belongs to the actor, private
GET    /workspace/pages/:id/shares             -> PageShare[]    needs view
PUT    /workspace/pages/:id/shares             -> PageShare[]    { shares: [{ kind, target, permission }] } replaces all; owner only
PATCH  /workspace/pages/:id/checklist          -> PageDetail     { index, text, checked } needs edit
POST   /workspace/pages/:id/images             -> { url }        multipart field `files`, one image, needs edit, 10 MB, stored with IcebergService
GET    /workspace/task-search?q=               -> [{ id, title, projectId, projectName }] max 10, not archived
```

`PATCH` with a stale `revision` returns 409 `{ message: 'Someone else changed this page. Reload to see the latest version.' }`
and saves nothing. Each successful content or title change does `revision + 1`, atomically (`UPDATE ... WHERE revision = $n`).

`checklist`: `index` is the zero-based position among `taskItem` nodes in depth-first order. If the item at `index` doesn't
exist or its text isn't `text`, return 409 with the same message. It bumps `revision`.

```ts
interface PageShare { kind: 'everyone' | 'department' | 'user'; target: string | null; permission: 'view' | 'edit'; user?: HubUser | null }
interface PageSummary {
  id: string; title: string; owner: HubUser | null; myAccess: 'owner' | 'edit' | 'view';
  sharedWith: { everyone: boolean; departments: string[]; userCount: number };
  checklist: { done: number; total: number };
  excerpt: string; updatedAt: string; updatedBy: HubUser | null;
}
interface PageDetail extends PageSummary { content: any; revision: number; createdAt: string }
```

Sharing notifies people newly added by `user` or `department` share (never `everyone`, to avoid mailing the whole company),
never the actor, skipping inactive users. New enum value `page_shared`, `title: 'Julia shared a page with you'`,
`message: <page title>`, `link: '/pages/<id>'`.

## My Day

```
GET /workspace/my-day -> MyDay
```

```ts
interface MyDay {
  date: string;                        // YYYY-MM-DD in ORG_TIMEZONE, as daily focus computes it
  tasks: MyDayTask[];                  // assigned to me (assignedToId or task_assignees), not Completed, not archived, due today or overdue. Max 30, oldest due first
  focus: MyDayTask[];                  // today's daily_focus_items whose task is assigned to me, by rank
  checklist: { pageId: string; pageTitle: string; index: number; text: string }[]; // unchecked items on pages I own, max 20, most recently updated pages first
  mentions: { id: string; title: string; message: string; link: string | null; projectId: string | null; taskId: string | null; createdAt: string }[];
                                       // my unread notifications of type mention, product_mention, product_reply, page_shared. Max 10, newest first
  recentPages: { id: string; title: string; openedAt: string }[]; // 6 most recently opened pages I can still see
}
interface MyDayTask { id: string; title: string; projectId: string; projectName: string; status: string; dueDate: string | null; overdue: boolean }
```
