# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev     # dev server at http://localhost:3000
npm run build   # production build (also the main type-check)
npm run lint    # eslint (flat config, eslint-config-next)
```

There is no test suite. `next.config.ts` allows `*.trycloudflare.com` as a dev origin so the dev server can be shared through a Cloudflare tunnel for multiplayer testing.

## What this is

"Salón de Juegos": a hub (`app/page.tsx`) of real-time multiplayer browser games. Currently one game: a collaborative jigsaw puzzle (`/rompecabezas` to create/join, `/sala/[roomId]` to play). UI text is in Spanish (rioplatense voseo: "Subí", "Elegí") — keep that tone.

Stack: Next.js 16 App Router + React 19, Tailwind v4, Konva/react-konva for the board, Firebase Realtime Database + Storage. **There is no backend of our own and no Firebase Auth** — everything runs client-side; player identity is a random id in `localStorage` (`hooks/useClientIdentity.ts`). Firebase config comes from `NEXT_PUBLIC_FIREBASE_*` env vars (in `.env`, gitignored); when missing, pages render `FirebaseSetupNotice` instead of crashing. The Firebase project (`lenovo-experiences`) is shared with other company apps — don't modify its DB/Storage rules.

## Architecture

- **Deterministic geometry** (`lib/puzzleGeometry.ts`): piece shapes (curved tabs) are generated from `rows`, `cols`, and a numeric `seed` stored in the room meta. Every client recomputes identical pieces locally; geometry is never sent over the network. Any change to the generator must stay deterministic across clients and will alter existing rooms.
- **Rendering** (`lib/piecesRender.ts`, `components/PuzzleStage.tsx`, `PuzzlePiece.tsx`): the image is clipped into per-piece bitmaps; `PuzzleStage` handles zoom/pan/drag and snapping (`SNAP_DISTANCE`). It's loaded via `next/dynamic` with `ssr: false` in `RoomClient` because Konva needs the DOM.
- **Room data** (`lib/room.ts`) — all RTDB access goes through here:
  - `rooms/{id}/meta` — image URL/size, rows/cols, seed, `mode` (`"colab" | "versus"`).
  - `rooms/{id}/pieces/{pieceId}` — `{x, y, placed, holder}` (colab). In versus mode each team has its own copy at `rooms/{id}/teams/{red|blue}/pieces`.
  - `rooms/{id}/race` — versus race state, mutated only via `runTransaction` (`startRace`, `reportTeamFinished`). Winner detection runs in the browser of whoever places the last piece.
  - Image is uploaded to Storage at `rooms/{id}/image.jpg` after client-side downscale (`prepareImage`).
- **Piece locking**: dragging sets `holder` to the client id (`holdPiece`) with an `onDisconnect` cleanup; `releasePiece` writes the final state and cancels that handle. Pieces held by others or already `placed` are not draggable. Positions are written live during drag, throttled.
- **Presence** (`lib/presence.ts`): connected players with name/color, removed via `onDisconnect`.

## Gotchas

- RTDB silently drops `null`-valued keys on write. Fields typed as `T | null` (e.g. in `RaceState`) may be *absent* at runtime — normalize on read as `subscribeRace` does.
- Room codes are 6 characters and uppercased in `app/sala/[roomId]/page.tsx`; `params` is a Promise in this Next version.
