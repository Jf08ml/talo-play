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

**Talo**: social games to play together — in pairs, with friends, in groups or solo. The core flow is: pick a game, create a room, send the link (WhatsApp), others tap it, type a name and play; no sign-up. The home (`app/page.tsx`) asks "¿Con quién vas a jugar?" and filters games by `PlayContext`. Each game has a lobby at `/{game}` and rooms at `/{game}/[roomId]`; games so far: `rompecabezas` (collaborative/versus jigsaw), `memotest` (pairs), `tutti` (Tutti Frutti, at `/tutti-frutti`), `dibujo` (Dibujá y adiviná), `codigo` (Código secreto, at `/codigo-secreto`) and `deslizante` (sliding puzzle race). UI text is in Spanish (rioplatense voseo: "Subí", "Elegí") — keep that tone.

Stack: Next.js 16 App Router + React 19, Tailwind v4, Konva/react-konva for the puzzle board, Firebase Realtime Database + Storage. **There is no backend of our own and no Firebase Auth** — everything runs client-side. Firebase config comes from `NEXT_PUBLIC_FIREBASE_*` env vars (in `.env`, gitignored); when missing, pages render `FirebaseSetupNotice` instead of crashing. The Firebase project is `talo-play` (`.firebaserc`); rules live in `database.rules.json` / `storage.rules`. The Storage bucket needs the CORS config in `cors.json` (applied with `gcloud storage buckets update gs://talo-play.firebasestorage.app --cors-file=cors.json`, not by `firebase deploy`) because the puzzle loads its image with `crossOrigin` to cut it on a canvas.

## Architecture

### Shared by every game

- **Identity** (`hooks/useClientIdentity.ts`): random client id + player name in `localStorage` (`salon.*` keys, migrated from the old `rompecabezas.*`), shared across games. The name is asked only when about to play: lobbies via `PlayerIdentity`, rooms via `NamePrompt invitedTo=…` (tells invitees which game they're joining). The home never blocks on it.
- **Game catalog** (`lib/games.ts`, pure data — safe in server components): per game `title`, `tagline`, `min/maxPlayers`, `duration`, `contexts`, `howTo`; plus `CONTEXTS`, `GAME_ORDER`, `roomPath()`. It's the single source for home cards, lobbies, waiting rooms and link previews — add a game there first. Every room stores `rooms/{id}/meta/game` (older puzzle rooms have none = `rompecabezas`). Room codes are global: `/sala/[roomId]` looks the game up (`lib/roomLookup.ts`) and redirects; the home's "¿Te invitaron?" (`JoinRoomForm`) and old links use it. Each room client redirects to `/sala/{id}` if the meta is another game's.
- **Host**: `meta.hostId` = the creator's client id (passed to each `create…Room`). Only the host sees "Empezar", unless there is no host (older rooms) or the host isn't connected — then anyone can (`startPermission` in `components/WaitingRoom.tsx`), so a room never gets stuck.
- **Inviting** (`lib/share.ts`, `components/InviteCard.tsx`): big code + WhatsApp (`wa.me`) + native share sheet + copy link, using the game's room URL. `RoomHeader` always has "Invitar". Link previews: `app/opengraph-image.tsx` (brand image) and `generateMetadata` → `lib/inviteMetadata.ts` in every `[roomId]/page.tsx` ("¡Te invitaron a jugar X!"). `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` (default https://talo-play.vercel.app).
- **UI pieces**: `TaloLogo`/`TaloMark`, `GameLobby` (catalog header, name, the game's create form as children, how to play), `WaitingRoom` (pre-game screen: players with 👑 host, settings summary, invite, how to play, start), `RoomHeader`, `RoomStatus`, `components/ui.ts` (shared Tailwind class strings).
- **Presence** (`lib/presence.ts`, `hooks/useRoomPresence.ts`): connected players with name/color, removed via `onDisconnect`.
- **Seeded randomness** (`lib/random.ts`): `mulberry32`, `seededShuffle`. Anything derived from a seed stored in the room must stay deterministic across clients; changing it alters existing rooms.
- **No host**: shared game state (turns, rounds, races) is only mutated through `runTransaction` (`lib/transact.ts` wraps it with a normalizer), so concurrent clients can't double-apply a move. Timers/delays are scheduled by every client and made idempotent by the transaction (see `resolveMismatch`), so one player leaving can't freeze a game.

### Rompecabezas (`app/rompecabezas`, `lib/puzzleRoom.ts`)

- **Deterministic geometry** (`lib/puzzleGeometry.ts`): piece shapes (curved tabs) are generated from `rows`, `cols`, and `seed` in the room meta; geometry is never sent over the network.
- **Rendering** (`lib/piecesRender.ts`, `components/PuzzleStage.tsx`, `PuzzlePiece.tsx`): the image is clipped into per-piece bitmaps; `PuzzleStage` handles zoom/pan/drag and snapping (`SNAP_DISTANCE`). It's loaded via `next/dynamic` with `ssr: false` in `RoomClient` because Konva needs the DOM.
- **Room data** (`lib/puzzleRoom.ts`):
  - `rooms/{id}/meta` — image URL/size, rows/cols, seed, `mode` (`"colab" | "versus"`).
  - `rooms/{id}/pieces/{pieceId}` — `{x, y, placed, holder}` (colab). In versus mode each team (`lib/teams.ts`) has its own copy at `rooms/{id}/teams/{red|blue}/pieces`.
  - `rooms/{id}/race` — versus race state, mutated via `startRace`, `reportTeamFinished`. Winner detection runs in the browser of whoever places the last piece.
  - Image is uploaded to Storage at `rooms/{id}/image.jpg` after client-side downscale (`prepareImage`).
- **Piece locking**: dragging sets `holder` to the client id (`holdPiece`) with an `onDisconnect` cleanup; `releasePiece` writes the final state and cancels that handle. Pieces held by others or already `placed` are not draggable. Positions are written live during drag, throttled.

### Memotest (`app/memotest`, `lib/memotest.ts`)

- `rooms/{id}/meta` — fixed setup: deck `kind` (`emoji` with a `theme` from `lib/memotestDecks.ts` + `pairs`, `fotos` with `images` uploaded to Storage as `rooms/{id}/card-{i}.jpg`, or `texto` with `textPairs`) and `rules` (`mode` turnos/colab, `extraTurn`, `turnSeconds`). Read it through `normalizeMeta` (early rooms have no `kind`/`rules`).
- `rooms/{id}/memo` — status, `seed` (per game, so "Jugar de nuevo" reshuffles), turn `order`, `players`, `turn`, `flipped`, `matched`, `moves`, server-time `startedAt`/`finishedAt`/`turnStartedAt` (`lib/serverTime.ts`).
- The deck is `buildDeck(seed, config)`, computed locally; cards match by `pair`, not by face (text pairs have different faces). Its card order before shuffling must stay as is, or rooms created earlier get a different layout.
- Everyone who enters joins the turn order. A miss stays face up for `MISMATCH_REVEAL_MS`, then any client's `resolveMismatch` turns it down (and passes the turn in turnos). When the turn timer runs out, or a player left, any client calls `passTurn`, guarded by the expected `turn` + `turnStartedAt`. In colab anyone can flip and nobody has a turn.

### Tutti Frutti (`app/tutti-frutti`, `lib/tutti.ts`)

- `rooms/{id}/meta` — `categories`, `rounds`, `roundSeconds` (0 = only "¡Basta!" ends a round), `letters`. The round's letter is `letterFor(seed, letters, round)` (seeded shuffle, no repeats).
- `rooms/{id}/tutti/state` — round flow `waiting → writing → reviewing → … → finished`, mutated only by transactions (`endRound`, `advanceRound`, `setReady`…). `gameNo` bumps on "Jugar de nuevo"; round data is keyed `g{gameNo}r{round}` (`roundKey`).
- `rooms/{id}/tutti/answers/{rk}/{clientId}` (`c{cat}` → text, saved debounced while typing) and `votes/{rk}/{authorId}__c{cat}/{voterId}` (true = rejected) are plain writes outside the state transaction.
- Scores are never stored: `scoreRound` computes them on every client from answers + votes (invalid if wrong letter or rejected by more than half of the other players; 20 only valid / 10 unique / 5 repeated, compared with `normalizeAnswer`). The round advances when every connected player is `ready`.

### Dibujá y adiviná (`app/dibujo`, `lib/dibujo.ts`)

- `rooms/{id}/meta` — `rounds` (times each player draws), `drawSeconds`, optional `customWords` + `useDefaultWords` (`lib/dibujoWords.ts`). Word options per turn come from `wordOptions(seed, wordPool(meta), turnNo)`.
- `rooms/{id}/dibujo/state` — turn flow `choosing → drawing → reveal` (then the next turn or `finished`), with `drawer` fixed when each turn starts (players joining mid-turn don't shift it), the chosen `word`, `guessed` and cumulative `scores`. All via transactions guarded by `turnNo`; phase timeouts (`CHOOSE_SECONDS`, `drawSeconds`, `REVEAL_MS`) and absent drawers are handled by whichever client notices.
- `strokes/{turnKey}/{pushId}` — `{color, width, points}` in a 1000×750 logical canvas (`components/dibujo/DrawingCanvas.tsx`, plain 2D canvas, no Konva), resent every 80 ms while drawing and followed with child events. `chat/{turnKey}` holds wrong guesses; correct ones are checked locally (`checkGuess`, accent-insensitive, "¡Casi!" at edit distance 1) and only recorded through `submitCorrectGuess`.
- The secret word lives in the state, so it's readable with DevTools — accepted, there is no backend to hide it.

### Código secreto (`app/codigo-secreto`, `lib/codigo.ts`)

- Codenames-style, red vs blue (`lib/teams.ts`). `buildBoard(seed)` derives the 25 words (`lib/codigoWords.ts`) and the key (9 for `startingTeam(seed)`, 8, 7 neutral, 1 bomb) locally; spymasters just render it.
- `rooms/{id}/codigo/state` — `players` with `team` + `spymaster` (one per team; mid-game joiners can only enter as agents), `turn`, `phase` (`clue` / `guess`), `guessesLeft`, `revealed`, `clues`, `winner`/`endReason`. All moves are transactions that check the caller's role (`giveClue`, `revealCard`, `endGuessing` guarded by the clue count). Revealing a team's last card wins it the game, even if the rival revealed it; the bomb loses. "Nueva partida" goes back to team setup with a new seed.

### Rompecabezas deslizante (`app/deslizante`, `lib/deslizante.ts`)

- Race mode: `rooms/{id}/meta` has `size` (3–5), `imageUrl` (square crop via `lib/images.ts`, Storage `rooms/{id}/image.jpg`) and `showNumbers`. Everyone starts from `scramble(size, seed)` — a seeded random walk of the gap from the solved board, so it's always solvable.
- A board is `tiles[position] = tile` (tile `t` belongs at `t - 1`, 0 = gap). Each player writes only their own `rooms/{id}/desliz/boards/g{gameNo}/{clientId}` (`{tiles, moves}`); others render it as a live preview. Moves are validated client-side (`slide`).
- `desliz/state` — `startedAt` (server time, `COUNTDOWN_MS` ahead, moves locked until then), `results` (`reportFinish`, once per player) and `winner` (first to report). "Nueva carrera" needs a winner and goes back to waiting with a new seed.

## Gotchas

- RTDB silently drops `null`-valued keys and empty arrays/objects on write. Fields that may be null/empty may be *absent* at runtime — normalize on read as `subscribeRace` and memotest's `normalizeState` do.
- RTDB turns objects with numeric keys into arrays; key such maps with strings (memotest uses `c{index}`).
- Room codes are 6 characters and uppercased in each `[roomId]/page.tsx`; `params` is a Promise in this Next version.
