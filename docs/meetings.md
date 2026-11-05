# Meetings: video calls inside the platform

The video runs on LiveKit (Cloud or self-hosted); browsers connect to it directly and no video passes through this
backend. The backend schedules meetings, decides who may join and signs short-lived join tokens.

## Setup

1. Run `npm run migrate:meetings` before deploying this code.
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Without them everything works except joining a
   call, which answers 503 with a plain message.

## Who can do what

- Host and invited teammates can see and join a meeting. Everyone else gets a 404, including CEO and PMs.
- Only the host can edit, cancel, end, manage the guest link or admit guests.
- Guests open `/m/:guestCode`, enter a name and wait until the host admits them.

## Routes (all need a login)

- `GET /meetings?view=upcoming|past`
- `POST /meetings` `{ title, notes?, startsAt?, durationMinutes?, projectId?, inviteeIds? }`. No `startsAt` means now.
- `GET /meetings/:id`, `PATCH /meetings/:id`
- `POST /meetings/:id/join` returns `{ url, token, isHost }`
- `POST /meetings/:id/end`, `POST /meetings/:id/cancel` (host; disconnects everyone)
- `POST /meetings/:id/guest-link` `{ enabled?, regenerate? }` (host)
- `GET /meetings/:id/guests` (host; waiting room)
- `POST /meetings/:id/guests/:guestId` `{ decision: 'admit' | 'deny' }` (host)

## Public routes (rate limited; the code is the credential)

- `GET /public/meetings/:code`
- `POST /public/meetings/:code/guests` `{ name }` returns `{ guestId, secret }`
- `POST /public/meetings/:code/guests/:guestId/status` `{ secret }` returns the status, plus `{ url, token }` once admitted

## Not in this version

Recording, transcripts and AI summaries, scheduled reminders (there is no scheduler yet), calendar sync, removing one
person from a live call, and phone dial-in.
