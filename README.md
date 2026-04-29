# meinchat — fe-user plugin

User-dashboard frontend for the meinchat backend bundle: nickname
directory, address book, instant 1-on-1 messaging with images, and
peer-to-peer token transfer.

## Routes

All under `/dashboard/messages/*` — single nav entry "Messages":

- `/dashboard/messages` — inbox
- `/dashboard/messages/contacts` — address book
- `/dashboard/messages/:nickname` — conversation thread (auto-creates the
  conversation if absent)
- `/dashboard/profile/nickname` — set/change nickname

## Backend dependency

`vbwd-plugin-meinchat` exposing `/api/v1/nickname/*`, `/api/v1/contacts`,
`/api/v1/messaging/*`, `/api/v1/token-transfer*`. SSE auth uses a 60-min
`stream_token` minted via `POST /api/v1/messaging/stream/token`.

## Stores

- `useNicknameStore` — caller's own nickname.
- `useContactsStore` — personal address book (CRUD, pin, sort).
- `useMeinchatStore` — conversations + per-thread message buffer + SSE
  event handler.

## Composables

- `useMessagingStream` — `EventSource` wrapper with token mint + auto
  reconnect.
- `useNicknameSearch` — debounced prefix typeahead.

## Tests

```
npx vitest run plugins/meinchat/
```
