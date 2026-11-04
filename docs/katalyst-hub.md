# Katalyst Hub — build contract

One place to see every internal product (CourseForge, SOPMaster, Maistro, CMS, Project Management Tool, Iceberg): updates with @mentions, tickets, SOPs, files, links, domains, team, an encrypted credential vault with client share links, and demo accounts.

Clickable prototype (the UX reference): https://claude.ai/artifact/Tsdq4PcMtET48wRwDmLMt9 — the prototype's HTML is also at
`/private/tmp/claude-501/-Users-julia--claude-spares-spare-k4DrFm/f44b0e05-d06a-4a94-9693-59dc1d183e72/scratchpad/product-hub.html`.

## Decisions
- Everyone signed in can view and edit every product. "Deleting" a product archives it (`archivedAt`), restorable.
- Mentions, ticket assignments and replies notify in app (socket `new_notification`) and by email (existing `NotificationsService.create`, which emails through the n8n webhook and now uses `link` for the email button).
- The existing `tickets` table / "Submit ticket" feature is unrelated and must not change. Hub tickets are `product_tickets`.
- Vault reveal / copy / share is allowed for: product owner, product team members, users with role `FOUNDER/CEO` or `Project Manager`. Everyone else sees the item but not the secret (`canReveal: false`), and can't edit or delete it (403) — otherwise someone who can't read a password could overwrite it or make it shareable.

## Going live
1. Generate a vault key once (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), set `VAULT_ENCRYPTION_KEY` on the production backend, and store a copy somewhere safe. Losing it makes every saved password unreadable; changing it does the same.
2. Run `npm run migrate:katalyst-hub` against the production database. It creates no products; people add them in the Hub.
3. Deploy backend, then frontend.

## Conventions (backend, NestJS + TypeORM + Postgres)
- `synchronize` is off. Schema changes go in `migrations/hub-NN-*.sql` (idempotent: `IF NOT EXISTS`, wrapped in BEGIN/COMMIT). `npm run migrate:katalyst-hub` runs every `hub-*.sql` in order.
- Column names are camelCase quoted (`"productId"`), tables snake_case, uuid PKs `DEFAULT gen_random_uuid()`, timestamps `TIMESTAMP WITH TIME ZONE`.
- Controllers use `@UseGuards(JwtAuthGuard)`; the actor is `req.user.userId` (role in `req.user.role`). Validate bodies with class-validator DTOs (see `src/tasks/dto`). Return 400 with a specific, human message on bad input, 404 when not found, 403 when not allowed.
- User objects in responses are always the safe shape `{ id, name, avatarUrl, role }` — never select password/otp/reset fields.
- Mentions are stored inline as `@Name[[USER_ID:<uuid>]]`. Use `extractMentionIds` / `stripMentionMarkup` from `src/shared/mentions.ts`. Never notify the actor. On edit, only notify newly added mentions.
- Notifications: `notificationsService.create({ type, title, message, userId, productId, link })` with `NotificationType.PRODUCT_MENTION | PRODUCT_ASSIGNED | PRODUCT_REPLY`. Wrap each call in try/catch so a failed notification never fails the request. `link` is a frontend path (see Routes).
- Files go to Iceberg via `IcebergService` (`SharedModule`), folder `products/<productId>`. Store `url`, `storageKey` (the Iceberg key, needed to delete), name, size, content type. Max 50 MB per file.
- `:id` in product routes is the product **uuid**. Only `GET /products/by-slug/:slug` takes a slug.

## Data model
| Table | Columns |
|---|---|
| products (exists) | id, slug, name, code (ticket prefix), description, status `live|beta|building|paused`, version, ownerId, ticketSeq, archivedAt, createdById, createdAt, updatedAt |
| product_members | id, productId, userId, area, askAbout, createdAt |
| product_links | id, productId, kind `environment|link`, label, url, sortOrder, createdAt |
| product_domains | id, productId, domain, registrar, dnsProvider, renewsOn (date), sslExpiresOn (date), createdAt, updatedAt |
| product_updates | id, productId, authorId, type `progress|release|heads_up|blocker|question`, body, editedAt, createdAt |
| product_update_comments | id, updateId, authorId, body, createdAt |
| product_files | id, productId, updateId (nullable, ON DELETE SET NULL), name, folder, url, storageKey, contentType, sizeBytes, uploadedById, createdAt |
| product_tickets | id, productId, number, key (`CF-12`), title, type `bug|feature|request|task`, priority `high|medium|low`, status `todo|in_progress|in_review|done`, assigneeId, reporterId, description, createdAt, updatedAt; unique(productId, number) |
| product_sops | id, productId, title, audience, ownerId, createdAt, updatedAt |
| product_sop_steps | id, sopId, position, text, links jsonb `[{kind:'url'|'tab'|'credential'|'file', ref, label}]` |
| product_sop_progress | id, stepId, userId, createdAt; unique(stepId, userId) |
| product_credentials | id, productId, label, environment `production|staging|demo`, loginUrl, username, secretEncrypted, shareable bool, createdById, updatedById, createdAt, updatedAt |
| product_credential_events | id, credentialId, userId (null = client via share link), action `created|edited|revealed|copied|shared|share_viewed|share_revoked`, detail, createdAt |
| product_credential_shares | id, credentialId, tokenHash (sha256, unique), expiresAt, oneTime, viewedAt, revokedAt, createdById, createdAt |
| product_demo_accounts | id, productId, clientName, loginEmail, purpose, credentialId (nullable, ON DELETE SET NULL), avatarStatus & transcriptStatus `not_started|in_progress|done|not_needed`, ownerId, createdAt, updatedAt |

All child tables: `"productId" ... REFERENCES products(id) ON DELETE CASCADE`.

## API
### Core — `src/products` (helper B1)
- `GET /products?archived=true|false` (default false) → `ProductSummary[]`: product fields + `owner`, `members: [{ userId, area }]`, `openTickets`, `highPriorityOpen`, `lastUpdate: { at, author } | null`, `attention: Attention[]`. Count tickets with raw SQL against `product_tickets` (table exists once hub-03 is applied; if the query fails, treat counts as 0).
- `Attention = { level: 'critical'|'warning'|'info', message, tab }`: domain renews ≤30 days → critical "Domain x renews in N days" (tab `files`); SSL ≤30 days → critical; open high-priority tickets → warning (tab `tickets`); no update in 10 days → info (tab `updates`). Expired → "expired N days ago".
- `POST /products` `{ name, code?, description?, status, version?, ownerId, productionUrl? }` → slug from name (unique, add `-2`…), code = uppercase initials/first letters if missing (unique, 2–5 chars). Adds the owner as member area "Owner", productionUrl as environment link "Production". 400 "A product named X already exists."
- `GET /products/by-slug/:slug` → `ProductDetail`: product + owner + members (with `user`) + links + domains + attention + `counts: { updates, openTickets, sops, files, credentials, demoAccounts, members }` (raw counts; missing tables → 0).
- `PATCH /products/:id` `{ name?, description?, status?, version?, ownerId? }`
- `POST /products/:id/archive`, `POST /products/:id/restore`
- Members: `POST /products/:id/members { userId, area, askAbout? }` (notify the person, PRODUCT_ASSIGNED, link `/products/<slug>/team`), `PATCH /products/:id/members/:memberId`, `DELETE /products/:id/members/:memberId`
- Links: `POST /products/:id/links { kind, label, url }`, `PATCH /products/:id/links/:linkId`, `DELETE …`
- Domains: `POST /products/:id/domains { domain, registrar?, dnsProvider?, renewsOn, sslExpiresOn }`, `PATCH /products/:id/domains/:domainId`, `DELETE …`
- Updates: `GET /products/:id/updates` → newest first, each with `author`, `comments[]` (with `author`, oldest first), `files[]`. `POST /products/:id/updates` multipart: `type`, `body`, `files[]` (field name `files`, up to 10). `PATCH /products/:id/updates/:updateId { type?, body? }` sets editedAt. `DELETE /products/:id/updates/:updateId` (comments cascade; attached files keep existing with updateId null).
- Comments: `POST /products/:id/updates/:updateId/comments { body }` → notify mentions (PRODUCT_MENTION) and the update author (PRODUCT_REPLY) unless mentioned or the actor. `DELETE /products/:id/updates/:updateId/comments/:commentId` (author only → 403 otherwise).
- Files: `GET /products/:id/files`, `POST /products/:id/files` multipart `files[]` + `folder` (default "General"), `DELETE /products/:id/files/:fileId` (also deletes from Iceberg; ignore Iceberg 404).
- Update notification links: `/products/<slug>/updates?update=<updateId>`.

### Tickets, SOPs, search — `src/product-tickets`, `src/product-sops`, `src/product-search` (helper B2)
- `GET /products/:id/tickets?assigneeId=&status=&q=` → with `assignee`, `reporter`. `POST /products/:id/tickets { title, type, priority, assigneeId?, description? }` → number from `UPDATE products SET "ticketSeq" = "ticketSeq" + 1 … RETURNING` (atomic), key = `${code}-${number}`. `GET /products/:id/tickets/:ticketId`, `PATCH /products/:id/tickets/:ticketId { title?, type?, priority?, status?, assigneeId? (null to unassign), description? }`, `DELETE`.
- Ticket notifications: assignee set/changed to someone other than the actor → PRODUCT_ASSIGNED "X assigned you CF-12"; new mentions in description → PRODUCT_MENTION. Link `/products/<slug>/tickets?ticket=<key>`.
- `GET /products/:id/sops` → each with `owner`, `steps` (by position) and `completedStepIds` for the current user. `POST /products/:id/sops { title, audience?, ownerId, steps: [{ text, links? }] }` (≥1 step). `PATCH /products/:id/sops/:sopId { title?, audience?, ownerId?, steps? }` — steps replace the list; a step with an existing `id` keeps its id (and progress), others are created, missing ones deleted. `DELETE`. `POST /products/:id/sops/:sopId/steps { text, links? }` appends. `PUT /products/:id/sops/:sopId/steps/:stepId/progress { done }`. Mentions in step text notify (link `/products/<slug>/sops?sop=<id>`).
- `GET /product-search?q=` (min 2 chars, max 20 results, non-archived products only) → `[{ kind: 'product'|'ticket'|'sop'|'update'|'credential', title, subtitle, productSlug, tab, ref }]`. Credentials match on label only — never search or return secrets or usernames.

### Vault and demo accounts — `src/product-vault` (helper B3)
- Encryption: AES-256-GCM, key from env `VAULT_ENCRYPTION_KEY` (32 bytes, base64). Store `v1:<iv b64>:<tag b64>:<ciphertext b64>`. If the key is missing or wrong length, create/reveal/share return 503 "The vault is not set up yet. Ask an admin to set VAULT_ENCRYPTION_KEY." Never log secrets. Never return `secretEncrypted`.
- `GET /products/:id/credentials` → `[{ id, label, environment, loginUrl, username, shareable, createdBy, updatedAt, lastEvent: { action, user, at } | null, canReveal }]`
- `POST /products/:id/credentials { label, environment, loginUrl?, username, secret, shareable }`, `PATCH …/:credId` (secret optional; only re-encrypt when given), `DELETE …/:credId`. Each logs an event.
- `POST /products/:id/credentials/:credId/reveal { purpose: 'reveal'|'copy' }` → `{ secret }`; 403 "Only people on this product can see this password." when not allowed; logs `revealed`/`copied`.
- `GET /products/:id/credentials/:credId/events` → last 20 with `user`.
- `POST /products/:id/credentials/:credId/shares { expiresIn: '1h'|'24h'|'7d', oneTime }` → `{ id, url, expiresAt, oneTime }` (only if `shareable`, else 400). Token: 32 random bytes base64url; store only its sha256. `url = <FRONTEND_URL>/share/<token>`. `GET …/shares` (active ones, no tokens), `DELETE …/shares/:shareId` revokes.
- Public, no auth: `GET /vault-shares/:token` → `{ label, productName, expiresAt, oneTime }` without consuming. `POST /vault-shares/:token/open` → `{ label, productName, loginUrl, username, secret }`; marks viewed when oneTime; logs `share_viewed` (userId null). Expired / used / revoked / unknown → 410 `{ message: "This link has expired or was already used. Ask the person who sent it for a new one." }`.
- Demo accounts: `GET /products/:id/demo-accounts` (with `owner`, `credential: { id, label } | null`). `POST { clientName, loginEmail, purpose?, ownerId, avatarStatus, transcriptStatus, password?, savePassword?, credentialId? }` — with `password` and `savePassword`, create credential "Demo login · <clientName>" (environment demo, shareable, username = loginEmail) and link it. `PATCH …/:demoId` (any field incl. credentialId null), `DELETE`. Notify the owner (PRODUCT_ASSIGNED, link `/products/<slug>/demo-accounts`) when it is someone else.

## Frontend routes (React Router, inside `DashboardLayout` unless noted)
- `/products` — All products
- `/products/:slug` and `/products/:slug/:tab` — tabs: `overview`, `updates`, `tickets`, `sops`, `demo-accounts`, `vault`, `files`, `team`. Query params open a specific item: `?update=`, `?ticket=<key>`, `?sop=`, `?credential=`.
- `/share/:token` — public client page, outside `DashboardLayout` and `PrivateRoute`.

## Frontend conventions
- Hub screens follow the design spec (see the prototype): neutral slate surfaces, one restrained blue accent, no gradients, DM Sans/DM Mono, spacing 4/8/12/16/24/32/48/64, radius 6–8 controls / 8–10 buttons & inputs / 10–12 cards / 12–16 modals, borders over shadows, light and dark themes.
- Shared Hub UI lives in `src/components/hub/` with styles in `src/components/hub/hub.css`, all class names prefixed `hub-` so nothing leaks into the rest of the app. API calls live in `src/services/hub.service.ts` (uses the existing axios setup in `src/services/apiSetup.ts`).
- Every create/edit is a modal (long ones as steps), detail views as a side drawer, deletes confirm and offer Undo (delay the DELETE request ~6 s; cancel it on Undo). Buttons show "Saving…" and disable while a request runs; failures keep the modal open with the input and show the server's message. Empty states explain what goes there and offer the main action.

## Local development — read before running anything
- The backend `.env` `DATABASE_URL` is the **live** database. Never run migrations, scripts or servers with it. Always use `DATABASE_URL=postgresql://localhost:5432/telos_local`.
- The email webhook defaults to the live n8n server. Any locally run process that creates notifications must set `NOTIFICATION_WEBHOOK_URL=http://127.0.0.1:9/disabled`.
- The user already runs a local backend on port 3000 (`npm run start:local`, auto-reloads) and the frontend on port 3001. Don't stop or kill them, and don't use the port 3000 backend for anything that creates notifications (it emails through the live webhook).
- Helpers building in parallel: don't start servers (builds write the shared `dist/`). Check your work with the type-check and jest unit tests (`src/**/*.spec.ts`, run with `node node_modules/jest/bin/jest.js <path>`). You may apply your own migration to `telos_local` with `DATABASE_URL=postgresql://localhost:5432/telos_local npm run migrate:katalyst-hub` and inspect it with `psql -d telos_local`. The lead runs the end-to-end API test on a separate instance with email disabled.
- Local logins: see `scripts/seed-local.js` (e.g. `head.pm@telos.local`, password `telos-local-2026`).
- Type-check with `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (the `.bin` shims lack execute permission).
