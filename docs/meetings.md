# Meetings: video calls inside the platform

The video runs on LiveKit (Cloud or self-hosted); browsers connect to it directly and no video passes through this
backend. The backend schedules meetings, decides who may join and signs short-lived join tokens.

## Setup

1. Run `npm run migrate:meetings` before deploying this code. It is safe to run again after each new migration.
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Without them everything works except joining a
   call, which answers 503 with a plain message.
3. For notes, set `DEEPGRAM_API_KEY` as well as the existing `ANTHROPIC_API_KEY`. `DEEPGRAM_BASE_URL` is optional and
   points transcription at another region. Without both keys the notes button and Auto notes switch stay off.

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
- `POST /meetings/:id/participants/mute` `{ identity }` (host; they can unmute themselves)
- `POST /meetings/:id/participants/remove` `{ identity }` (host). A guest goes back to asking to join; a teammate can
  rejoin from the meeting page. A token already issued stays valid until it expires, so this is not a permanent ban.

## Recordings

Made in the host's browser and stored as private videos in Iceberg, under `PM_tool/meetings/<meetingId>/`. LiveKit's own
recording isn't used because it can't upload to Iceberg. Stopping when the host's tab closes is the known trade-off.

- `POST /meetings/:id/recordings` (host) starts one and sets `{ recording: true }` on the room, which drives the badge.
- `POST /meetings/:id/recordings/:rid/stop` `{ durationSeconds }`
- `POST /meetings/:id/recordings/:rid/upload` `{ contentType, sizeBytes }` returns `{ partSize }`
- `PUT /meetings/:id/recordings/:rid/parts/:n` raw bytes, returns `{ etag }`. The backend streams each part to storage
  because the Iceberg bucket doesn't accept browser uploads from this site.
- `POST /meetings/:id/recordings/:rid/complete` `{ parts: [{ partNumber, etag, size }] }` finishes and makes it private
- `POST /meetings/:id/recordings/:rid/fail`, `DELETE /meetings/:id/recordings/:rid` (host)
- `GET /meetings/recordings` lists those of meetings you host or were invited to, with no CEO or PM override
- `POST /meetings/recordings/:rid/playback` returns a 4-hour private link

## Notes

Otter-style notes: call audio is captured, transcribed by Deepgram and summarised by Claude, then emailed.

- **Capture:** one browser captures per call, the first with notes on. It sends 32 kbps audio every 15 seconds, stored
  in `meeting_note_chunks`. Everyone with notes on checks in every 15 seconds, and if the capturer's 45-second lease
  lapses, one of them takes over. Each take-over is a new segment, because the audio only joins up within a segment.
- **Finishing:** a timer in this service runs every 30 seconds. Notes close when the host ends the call, when the last
  listener leaves, or 3 minutes after the last check-in if tabs just closed. It tries 3 times, then marks them failed.
- **Audio:** deleted as soon as the transcript is saved. It's kept for 7 days if transcription failed.
- **Access:** only recipients can see notes, meaning people who had them on, or who they were shared with. No CEO or PM
  override. Being shared notes doesn't give access to the recording.
- **Notice:** everyone in the call sees a notes badge from the room's metadata. Guests are told before joining if notes
  are running or anyone on the meeting has Auto notes on. The host can stop notes for the call, which deletes what was
  captured.
- **Speaker names** come from LiveKit's active speaker events matched to Deepgram's lines, falling back to "Speaker N".

Routes (all need a login):

- `GET /meetings/notes/preferences`, `PATCH /meetings/notes/preferences` `{ autoNotes }`
- `GET /meetings/notes`, `GET /meetings/notes/:noteId`
- `DELETE /meetings/notes/:noteId` removes your copy; the notes go when nobody has them
- `POST /meetings/notes/:noteId/retry`, `POST /meetings/notes/:noteId/share` `{ userIds }`
- `PATCH /meetings/notes/:noteId/items/:itemId` `{ done }`
- `POST /meetings/notes/:noteId/items/:itemId/task` `{ projectId? }` makes a task assigned to the caller
- `POST /meetings/:id/notes/listen` `{ segment?, contentType?, speakers? }` returns `{ blocked, capturing, noteId, segment }`
- `POST /meetings/:id/notes/leave`, `POST /meetings/:id/notes/block` `{ blocked }` (host)
- `PUT /meetings/:id/notes/:noteId/chunks/:segment/:seq` raw audio, up to 1 MB

## Public routes (rate limited; the code is the credential)

- `GET /public/meetings/:code`
- `POST /public/meetings/:code/guests` `{ name }` returns `{ guestId, secret }`
- `POST /public/meetings/:code/guests/:guestId/status` `{ secret }` returns the status, plus `{ url, token }` once admitted

## Not in this version

Notes for calls outside this platform, scheduled reminders (there is no scheduler yet), calendar sync and phone dial-in.
