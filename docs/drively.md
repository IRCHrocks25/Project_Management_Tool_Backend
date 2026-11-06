# Drively

The company's Drive: folders, Docs, Grid, Slides, PDFs and uploads. The backend implements this contract;
`src/services/drively.service.ts` in the frontend mirrors it. All routes need a login (`JwtAuthGuard`). The frontend
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
