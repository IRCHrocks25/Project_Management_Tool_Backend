# Drively

The company's Drive: folders, Docs, Grid, Slides, PDFs and uploads. The backend implements this contract;
`src/services/drively.service.ts` in the frontend mirrors it. All `/drively` routes need a team login (`JwtAuthGuard`); people outside the company use `/client-portal` (see Clients). The frontend
lives in `src/components/drively` under `/drively`, outside the side navigation. Forms stay at `/forms`; the New menu links there.

## Storage

Everything a file holds is a private Iceberg asset. Postgres keeps names, folders, sharing, stars and a small card
preview: the first lines of a Doc, first cells of a Grid or the text of the first slide.

| What | Where in Iceberg |
|---|---|
| Doc, Grid and Slides | One JSON asset per file, `drively/<ownerId>/content-*.json`: `{ content }` until first opened, then `{ yjs }` (base64 Yjs state) |
| Uploads and PDFs | The file itself, key `drively/<ownerId>/...` |
| Pictures in a Doc or Slides file | Listed in `drive_item_assets`, key `drively/<itemId>/...` |

Assets are private: `/a/<id>` answers 404 and the only way in is an expiring link from `POST /assets/{id}/delivery-links`.
`upload` removes an asset again if it can't be made private.

- Links expire, so pictures are drawn from `assetLinks` in `GET /items/:id` (24-hour links, only for assets listed for that
  file) and fall back to the `src` saved in the document for a picture someone just added.
- `GET /items/:id/link` gives a 1-hour link. A link keeps working until it expires even if access is removed; delete forever revokes them first.
- Writes use Iceberg `POST /assets/replace` with the row locked: same id, and the old bytes are archived as a version.
  Iceberg documents no clean-up for versions, so a much-edited file builds up archived copies. They could power version history later.
- Delete forever moves the asset to Iceberg's trash. Purging needs an owner token and a 30-day retention, so the app stops there.

## Live co-editing

`src/drively/drively.gateway.ts`, socket.io namespace `/drively`, JWT in `auth.token`. Each open Doc, Grid or Slides file is a
room holding a Yjs document. PDFs keep their Save button and a revision check.

- **Messages**: `join { itemId, stateVector, clientId }` answers `{ ok, level, update, stateVector, seed, seq, savedSeq }`.
  `update` and `awareness` relay to the room. The server sends `saved { seq }`, `save-failed`, `seed`, `peer-left`, `access` and `removed`.
- **Filling a new file**: the first person with edit access gets `seed: true` and writes the plain `content` into the shared document.
  If they leave first, the next editor is asked. After the first live save, `PATCH content` answers 409.
- **Saving**: 8 seconds after the last edit, at most 30 seconds apart, immediately when the room empties, and on shutdown
  (`enableShutdownHooks`). Failures retry every 15 seconds. Someone who was connected when the server died resends what's missing when they reconnect.
- **Offline**: editing continues and merges on reconnect.
- **Access**: view-only people's updates are refused on the server. Sharing and trash changes re-check everyone in every room, so anyone who lost access is removed at once.
- **One process only**: rooms live in memory, so the backend must run as a single Railway instance until rooms are shared, for example through Redis.

How each editor maps onto Yjs:

- **Docs**: `tabOrder`, `tabTitles` and one `XmlFragment` per tab (`tab:<id>`), through TipTap's collaboration extensions. Undo only takes back your own edits.
- **Slides** (`liveSlides.ts`): per-element last writer wins, so two people on one slide don't collide unless they're in the same element.
- **Grid** (`liveGrid.ts`): per-cell last writer wins through the workbook's `applyOp`. Sheet changes redraw the grid for others, which resets their selection.

## Access (pure functions in `drively.logic.ts`, unit tested)

Private by default with no admin override, the same as Pages: this holds personal things and possibly logins.

- Rules are `everyone`, `department` (a `UserRole`) or `user`, each `view` or `edit`.
- The strongest rule on the item or any parent folder wins. Owning a parent folder gives `edit` on what's inside.
- `owner` is the item's own owner. Only they can share, move, trash, restore and delete forever.
- No access answers 404, so a file's existence isn't leaked. View-only answers 403 on changes.

## Routes (`/drively`)

| Route | Notes |
|---|---|
| `GET /items?view=mine\|shared\|recent\|starred\|trash&parentId=&q=` | `q` searches names across everything reachable |
| `GET /storage` | `{ usedBytes }`: uploads, pictures and content the person owns. No quota is enforced |
| `POST /items` | `{ kind: folder\|doc\|grid\|slides, name?, parentId?, content?, preview? }`. `content` fills the new file's asset |
| `POST /upload` | Multipart `files` (20 max, 100 MB each) and `parentId`. Becomes `pdf` or `file` |
| `GET /items/:id` | Detail with `myAccess`, `path`, `assetLinks`, `hasLiveState`, and `content` if not opened yet. Records the open for Recent |
| `PATCH /items/:id` | `name`, `parentId` (owner), `preview`, or `content` + `revision` before a file's first live save. A stale revision answers 409 |
| `POST /items/:id/replace` | Multipart `file` + `revision`, for PDF saves |
| `GET /items/:id/link` | `{ url, expiresAt }` |
| `POST /items/:id/images` | Multipart `file`: PNG, JPG, GIF or WebP, 15 MB. `{ assetId, src }` |
| `POST /items/:id/duplicate`, `/star`, `/trash`, `/restore` | Trashing a folder trashes its contents; restore brings back that group |
| `DELETE /items/:id` | From the trash only. Other people's files inside return to their owners |
| `GET`/`PUT /items/:id/shares` | PUT replaces the list. Owner only |

## Formats

- **Docs**: exports all tabs to `.docx`, the open tab to PDF. `.docx` uploads convert through mammoth.
- **Grid**: exports `.xlsx` (exceljs) and CSV; CSV cells that could run as formulas are escaped.
- **Slides**: 960 x 540 coordinates. Exports `.pptx` and PDF.
  `.pptx` import keeps text, positions, basic text style, pictures, backgrounds and notes, but not shapes or animations.
- **PDF**: the file in Iceberg is the document. Page edits and marks live in the browser until Save, then pdf-lib writes a new file.
  pdf.js runs with `isEvalSupported: false` because PDFs are untrusted. Added text uses Helvetica, so non-Latin characters become `?`.

`public/vendor` holds `pdf.worker.min.js` and `pptxgen.bundle.js`. Update the worker whenever `pdfjs-dist` changes;
PptxGenJS 4 can't be bundled by CRA's webpack (it imports `node:fs`), so its browser build ships as a static script.

## Assistant

The assistant can create a Document, Grid, Slides, PDF or draft form (`create_document`, `create_spreadsheet`, `create_slides`, `create_pdf`, `create_form`). Each waits for Confirm like its other write tools, then shows an Open button that opens a new tab.

- `src/assistant/assistant.documents.ts` turns its outlines into editor content. Slide layouts and themes mirror `driveContent.ts` in the frontend.
- Files go in the person's own My Drive, private to them. Forms stay unpublished.
- Grid formulas are stored with no value. `GridEditor` works them out on load, which also makes them update when the cells they read change.
- PDFs use the built-in fonts, which cover Western languages only. Other characters become "?", and the assistant is told to say so.
- It can't read or change existing Drively files yet.

## Deploy

`npm run migrate:drively` before the backend deploys. The JSON body limit in `main.ts` went from 1.5 MB to 12 MB. Run a single backend instance (see Live co-editing).

## Clients (people outside the company)

Someone outside the company opens a one-time link, sets a name and a 6-digit code, and only ever sees what was shared with them. Frontend pages are under `/client`. Run `npm run migrate:drively` before deploying (`migrations/drively-02-clients.sql`).

**How they're kept out of everything else**

- **Their own table.** Clients are in `drive_clients`, not `users`, so nothing that lists, assigns, mentions or authorizes team members can reach them.
- **Their own token secret.** Client sessions are signed with a secret derived from `JWT_SECRET` (`clientTokenSecret`). Every team route and socket verifies against `JWT_SECRET`, so a client token fails all of them, including any added later, without those routes knowing clients exist. To let clients reach something new, add it to `DriveClientPortalController` on purpose.
- **Their own shares.** Access is only `drive_client_shares`, never `drive_item_shares`, so "Everyone at the company" and department shares can't reach a client and saving team sharing can't remove a client. Sharing a folder shares what's inside it. Folders above the one they were given stay hidden.
- **They can't change a file.** The only thing `/client-portal` lets a client add is a comment. In the `/drively` socket they join at `view` or `comment`, their updates are refused and they don't send presence.

**Routes**

| Route | Who | What |
|---|---|---|
| `GET /client-portal/links/:token` | Holder of the link | What the link is for |
| `POST /client-portal/links/:token/claim` | Holder of the link | `{ name, email?, code }` sets up or adds to an account; `{ code }` on a new code link. Spends the link. |
| `POST /client-portal/sign-in` | Anyone | `{ name, code }` |
| `POST /client-portal/forgot-code`, `reset-code` | Anyone | Emails a reset code; sets a new code with it |
| `GET /client-portal/me`, `items?parentId=`, `items/:id`, `items/:id/link` | Client | What they can see |
| `GET`, `POST /client-portal/items/:id/comments`, `PATCH`, `DELETE /client-portal/comments/:id`, `POST .../resolve` | Client with comment access | See Comments |
| `POST /drively/items/:id/client-links`, `DELETE .../client-links/:linkId` | File owner | Make or cancel an invite link |
| `GET`, `POST /drively/items/:id/client-access`, `PATCH`, `DELETE .../:clientId`, `POST .../:clientId/new-code-link` | File owner | See, add, change level, remove, send a new code link |
| `GET /drively/clients` | Team | Existing clients, to share another file without a new link |

**Rules**

- **Links** work once and stop after 30 days, or if the file is trashed. Only a hash of the token is stored, so a link can't be shown again.
- **Names aren't unique.** The code picks out who it is. If the name and code already match an account on a new link, the file joins that account. A wrong guess there creates a new account and spends the link, so a link gives one try.
- **An email already in use** with the wrong code is refused without spending the link, and counts toward that account's lockout.
- **Lockout:** every 5th wrong code locks the account, 15 minutes at first and doubling up to a day. A correct code resets the count. Someone who knows a client's name can trigger this, so it can inconvenience them for a while but not expose anything.
- **Rate limit:** `ClientIpThrottlerGuard`, 10 sign-ins a minute per address. It trusts the first `X-Forwarded-For` entry, which a caller can set, so the per-account lockout is the real limit on guessing.
- **Codes** are hashed with bcrypt, and easy ones (`123456`, `111111`, `121212`) are refused. Six digits is a small space: this suits review documents, not highly sensitive files.
- **Changing a code** raises `tokenVersion`, which ends every session using the old one. Sessions otherwise last 14 days.
- **Forgot code:** with an email, a 10-minute reset code (5 tries, 60 seconds between sends, same answer whether or not the email is known). Without one, the owner sends a new code link, which only works for a client who has access to that owner's file; their old code keeps working until it's used.

## Comments

Run `npm run migrate:drively` before deploying (`migrations/drively-03-comments.sql`). Routes are the same shape for both sides: `/drively/...` for team members and `/client-portal/...` for clients.

**Levels:** `view`, `comment`, `edit` and `owner`. `comment` can read and add comments but can't change the file. `driveAccessLevel` handles it itself, because `pageAccessLevel` for Pages only knows `view` and `edit`. In the frontend, check `canEditLevel(level)`, not `level !== 'view'`. Clients can be `view` or `comment`, never `edit`; a new client link defaults to `comment`.

**Who sees what**

- Team members with any access can read comments. They need `comment` or higher to add one.
- Team threads default to **Team only** (`visibility = 'team'`) so nothing reaches a client by accident. A team member can tick "Show to clients"; the box appears when a client with comment access can reach the file. Replies take their thread's visibility.
- A client's threads are always visible to clients. A client with `comment` access sees every thread shown to clients on that file, including other clients' comments on it.
- A `view` client sees no comments. For a client, a comment they can't see answers 404, the same as an ID that doesn't exist.

**Who can do what:** authors edit their own, while they still have comment access. Authors and the file's owner delete. Team members with comment access resolve any thread; a client resolves their own. A new reply reopens a resolved thread.

**Where a comment points** (`anchor`, null for the whole file)

- **Docs** store the words, the text around them and their old offset, not a position. Highlights are ProseMirror decorations, so nothing is written to the shared document and people who can't edit get them too. The copy with the most matching text around it wins. If the words are gone, the thread stays and says the text changed. A new document's first tab has a fixed id (`first-tab`), because someone viewing a never-opened file draws a local copy that has to match the shared one.
- **PDFs** store a page number and rectangles as fractions of the page, from selected text or from a dragged box ("Comment on an area", for scanned pages). They aren't adjusted if an editor later reorders or rotates pages. A thread whose page is gone says so.
- **Grid, Slides and other files** have whole-file comments in this release.

**Alerts:** a comment notifies the file's owner and team members already in the thread, in the app and by email. Clients in a shown thread who have an email get one. Everyone is re-checked first, so someone who has lost access isn't sent the words. Other people's comments appear within 20 seconds, or on returning to the tab.
