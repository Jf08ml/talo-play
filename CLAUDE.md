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

**Talo**: social games to play together — in pairs, with friends, in groups or solo. The core flow is: pick a game, create a room, send the link (WhatsApp), others tap it, type a name and play; no sign-up. The home (`app/page.tsx`) asks "¿Con quién vas a jugar?" and filters games by `PlayContext`. Each game has a lobby at `/{game}` and rooms at `/{game}/[roomId]`; games so far: `rompecabezas` (collaborative/versus jigsaw), `memotest` (pairs), `tutti` (Tutti Frutti, at `/tutti-frutti`), `dibujo` (Dibujá y adiviná), `codigo` (Código secreto, at `/codigo-secreto`), `deslizante` (sliding puzzle race), `cuatro` (4 en línea, at `/4-en-linea`), `palabra` (Palabra secreta, a Wordle race, at `/palabra-secreta`), `trivia`, `impostor` (El impostor), `naval` (Batalla naval, at `/batalla-naval`), `probable` (¿Quién es más probable?, at `/quien-es-mas-probable`), `conoces` (¿Cuánto me conocés?, at `/cuanto-me-conoces`), `generala`, `emojis` (Adiviná con emojis, at `/adivina-con-emojis`), `verdades` (Dos verdades y una mentira, at `/dos-verdades-una-mentira`), `damas`, `cajas` (Puntos y cajas, at `/puntos-y-cajas`), `reto` (Verdad o reto, at `/verdad-o-reto`), `mimica`, `ahorcado`, `sopa` (Sopa de letras, at `/sopa-de-letras`) and `carreras` (2D racing on a shared screen, phones as controllers) and `carreras3d` (Carreras 3D, at `/carreras-3d`: on a shared screen or each on their own phone) and `arena` (Arena medieval, at `/arena-medieval`: 3D knights, 1v1 to 3v3, optional bots). UI text is in Spanish (rioplatense voseo: "Subí", "Elegí") — keep that tone.

Stack: Next.js 16 App Router + React 19, Tailwind v4, Konva/react-konva for the puzzle board, Firebase Realtime Database + Storage. **There is no backend of our own and no Firebase Auth** — everything runs client-side. Firebase config comes from `NEXT_PUBLIC_FIREBASE_*` env vars (in `.env`, gitignored); when missing, pages render `FirebaseSetupNotice` instead of crashing. The Firebase project is `talo-play` (`.firebaserc`); rules live in `database.rules.json` / `storage.rules`. The Storage bucket needs the CORS config in `cors.json` (applied with `gcloud storage buckets update gs://talo-play.firebasestorage.app --cors-file=cors.json`, not by `firebase deploy`) because the puzzle loads its image with `crossOrigin` to cut it on a canvas.

## Architecture

### Shared by every game

- **Identity** (`hooks/useClientIdentity.ts`): random client id + player name in `localStorage` (`salon.*` keys, migrated from the old `rompecabezas.*`), shared across games. The name is asked only when about to play: lobbies via `PlayerIdentity`, rooms via `NamePrompt invitedTo=…` (tells invitees which game they're joining). The home never blocks on it.
- **Game catalog** (`lib/games.ts`, pure data — safe in server components): per game `title`, `tagline`, `min/maxPlayers`, `duration`, `contexts`, `howTo`; plus `CONTEXTS`, `GAME_ORDER`, `roomPath()`. It's the single source for home cards, lobbies, waiting rooms and link previews — add a game there first. Every room stores `rooms/{id}/meta/game` (older puzzle rooms have none = `rompecabezas`). Room codes are global: `/sala/[roomId]` looks the game up (`lib/roomLookup.ts`) and redirects; the home's "¿Te invitaron?" (`JoinRoomForm`) and old links use it. Each room client redirects to `/sala/{id}` if the meta is another game's.
- **Host**: `meta.hostId` = the creator's client id (passed to each `create…Room`). Only the host sees "Empezar", unless there is no host (older rooms) or the host isn't connected — then anyone can (`startPermission` in `components/WaitingRoom.tsx`), so a room never gets stuck.
- **Inviting** (`lib/share.ts`, `components/InviteCard.tsx`): big code + WhatsApp (`wa.me`) + native share sheet + copy link, using the game's room URL. `RoomHeader` always has "Invitar". Link previews: `app/opengraph-image.tsx` (brand image) and `generateMetadata` → `lib/inviteMetadata.ts` in every `[roomId]/page.tsx` ("¡Te invitaron a jugar X!"). `metadataBase` comes from `NEXT_PUBLIC_SITE_URL` (default https://talo-play.vercel.app).
- **Icons**: presentation UI (home, lobbies, headers, waiting room, invites) uses `lucide-react` icons, not emojis — game icons and accent colors live in `components/GameIcon.tsx` (`GameIcon`, `CONTEXT_ICONS`). Emojis inside the games are game content and stay.
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

### 4 en línea (`app/4-en-linea`, `lib/cuatro.ts`)

- `rooms/{id}/cuatro/state` — `seats` (`a` red / `b` yellow → client id), `cells` (a 42-char string, row-major from the top: `.` empty, `a`/`b` a disc), `turn`, `starter` (alternates on each "Revancha"), `lastMove`, `winner` (`a`/`b`/`draw`) and `wins` per client id. Everyone else in the room watches.
- Joining before the game auto-sits you in a free seat. A seat whose player left can be taken (`takeSeat`, guarded by the occupant you saw), also mid-game by a spectator. `dropDisc` is guarded by the move count so a double tap can't play twice; the win (`findWin`) is checked inside the transaction.

### Palabra secreta (`app/palabra-secreta`, `lib/palabra.ts`)

- Wordle race, same shape as the deslizante race: the word is `secretWord(seed)`, picked by index from `lib/palabraWords.ts` (append-only). Guesses are compared with `normalizeWord` (uppercase, no accents, but Ñ kept). There's no dictionary: any 5 letters count as a guess.
- Each player writes only `rooms/{id}/palabra/boards/g{gameNo}/{clientId}` (`{guesses}`); rivals render just the colors (`scoreGuess`), never the letters.
- `palabra/state` — `startedAt` (countdown), `results` (`reportFinish`, once per player, solved or out of tries), `winner` (first to solve) and `wins` per player. "Nueva palabra" can only be asked by someone who already finished.

### Trivia (`app/trivia`, `lib/trivia.ts`)

- `rooms/{id}/meta` — `questionCount`, `seconds`, `categories` (read through `normalizeMeta`). The game's questions are `pickQuestions(seed, categories, count)` — indexes into `lib/triviaQuestions.ts` (append-only; `a[0]` is the right answer) — and each one's option order is `questionView(seed, index)`.
- `rooms/{id}/trivia/state` — flow `question → reveal → … → finished`, like dibujo: `phaseStartedAt` (the first question's is `COUNTDOWN_MS` ahead), `answers` for the current question (`{choice, points}`, choice 0 = right) and cumulative `scores`. `submitAnswer` scores by time left (500–1000) and reveals once every connected player answered; otherwise any client calls `revealAnswer` / `nextQuestion` when the phase times out, guarded by `qNo`.

### El impostor (`app/impostor`, `lib/impostor.ts`)

- `rooms/{id}/meta` — `categories`, `clueMode` (`app`: clues typed by turns; `voz`: said out loud, the app only deals cards and runs the vote), `clueRounds`, `impostorHint` (the impostor sees the category). Read through `normalizeMeta`. The word is `secretFor(seed, categories)` from `lib/impostorWords.ts` (append-only).
- `rooms/{id}/impostor/state` — flow `clues → voting → guess → result` per round. Each round fixes `order` (the connected players, shuffled; later joiners watch until the next one) and `impostor` (random, stored in the state). `giveClue` is guarded by the clue count and speaker; `castVote` resolves once every connected player in the round voted (or `closeVote` on timeout): a tie or a wrong accusation makes the impostor win; catching them leads to `guess`, where `submitGuess` (checked locally with `guessMatches`) or `guessTimeout` ends it. Scores: crew +1 each, impostor +2.

### Batalla naval (`app/batalla-naval`, `lib/naval.ts`)

- Seats `a`/`b` like 4 en línea (auto-sit before the game, `takeSeat` of a left player, also mid-game by a spectator who inherits the fleet). Flow `waiting → placing → playing → finished`.
- Maps are 100-char strings, row-major on 10×10: `fleets/{seat}` has `.` water or the ship index (`FLEET`, `0`–`4`); `shots/{seat}` are the shots *fired by* that seat (`x`). Placement is local (`placeShip`, `randomFleet`) until `submitFleet`, which checks `validFleet`; when both are `ready` the battle starts. `fire` is guarded by the shooter's shot count; a hit shoots again. Both fleets are in the state (readable with DevTools — accepted); the UI only shows the rival's sunk ships until the end.

### ¿Quién es más probable? (`app/quien-es-mas-probable`, `lib/probable.ts`)

- `rooms/{id}/meta` — `decks` (`lib/probablePrompts.ts`, append-only), optional `customPrompts`, `questions`. The phrase is `promptFor(seed, promptPool(meta), qNo)`; the room plays `min(questions, pool size)`.
- `probable/state` — `voting → reveal → … → finished`. Anyone connected votes for anyone (themselves too); `castVote` resolves once every connected player voted, else `closeVote` on timeout. Voting with the most voted (`topVoted`, ties share) is +1; the most voted get a `titles` count and the question's `history`. "Siguiente" is any player's tap, no timer.

### ¿Cuánto me conocés? (`app/cuanto-me-conoces`, `lib/conoces.ts`)

- `meta.rounds` = questions per player. `conoces/state` fixes `order` (protagonists) at start; turn `n`'s protagonist is `order[n % len]` and its question `questionFor(seed, n)` (`lib/conocesQuestions.ts`, append-only).
- `answering → reveal`: the protagonist's `answer` and everyone else's `guesses` are submitted at the same time; it reveals when all connected players are in, on timeout (`closeTurn`), or skips (`skipTurn`) if the protagonist left without answering. Each right guess is +1 for the guesser and +1 for the protagonist; `hits` (`{protagonist}__{guesser}`) feeds "quién conoce mejor a quién".

### Generala (`app/generala`, `lib/generala.ts`)

- `generala/state` — `order` fixed per game (joiners watch), `turnNo` (player = `order[turnNo % len]`), `dice` (5 digits, "" before the first roll), `held` (`0`/`1` ×5), `rolls`, `sheets/{clientId}/{category}` (missing = empty box, 0 = crossed out). Dice are rolled with Math.random inside the `rollDice` transaction.
- Argentine rules in `scoreFor`: escalera 20/25 (1-5, 2-6 or 3-4-5-6-1), full 30/35, póker 40/45 servido, generala 50, generala servida wins on the spot, doble generala 100 only with the generala already at 50. If the player in turn left, anyone can `skipTurn` (crosses out their first empty box).

### Adiviná con emojis (`app/adivina-con-emojis`, `lib/emojis.ts`)

- Trivia's flow and timing (`question → reveal → … → finished`, countdown, auto-advance after `REVEAL_MS`), but answers are typed. Puzzles are `pickPuzzles(seed, categories, count)` — indexes into `lib/emojiPuzzles.ts` (append-only; `alt` = other accepted answers).
- `checkAnswer` runs locally (no accents/punctuation, leading article dropped, typo tolerance grows with length so refranes can be fuzzy; "close" → "¡Casi!"). Unlimited tries; only a right one is written (`submitSolved`, 500–1000 by time left), and the puzzle reveals once every connected player solved it. The answer hint shows each word's first letter from half time.

### Dos verdades y una mentira (`app/dos-verdades-una-mentira`, `lib/verdades.ts`)

- `verdades/state` — `writing → voting → reveal → … → finished`. In `writing` each player saves `statements/{clientId}` (`{s: [3 strings], lie}`) and can withdraw to edit; voting starts (`startVoting`, fixes a shuffled `order` of authors) when every connected player wrote, or earlier from an author's "Empezar sin esperar" (needs `MIN_AUTHORS`).
- Per author: the rest vote the lie's index (`castVote`, resolves when all connected non-authors voted, or `closeVote` on timeout). Right vote +1 to the voter; wrong vote +1 to the author. "Siguiente" is any player's tap. The lie is in the state (DevTools) — accepted.

### Damas (`app/damas`, `lib/damas.ts`)

- Seats like 4 en línea; `a` = blancas (bottom, move first), `b` = negras, whose board is drawn flipped. `cells` is a 64-char string (`.`, `a`/`b` men, `A`/`B` kings). Rules in `legalMoves`: men step forward, capture both ways; capture is mandatory (any, not the longest); a capturing piece continues while it can (`chain` = its square, same turn, captured pieces removed at once); crowning only when the move ends on the far row; kings fly. No legal moves = loss.
- `makeMove` is one step/jump guarded by `moveNo`. Also `resign` and `offerDraw` (the rival offering too = draw; any move clears the offer). "Revancha" swaps seats so colors alternate.

### Puntos y cajas (`app/puntos-y-cajas`, `lib/cajas.ts`)

- `meta.size` = boxes per side. `cajas/state` has `order` (up to `MAX_PLAYERS` of the connected, shuffled), `turn` (index in `order`), `lines` and `boxes` strings (`.` or the owner's index; horizontal lines first, then vertical — `hLine`/`vLine`/`boxLines`). `drawLine` is guarded by the drawn-line count; closing a box keeps the turn. If the player in turn left, anyone can `skipTurn`.

### Verdad o reto (`app/verdad-o-reto`, `lib/reto.ts`)

- `meta.levels` picks the decks of `lib/retoPrompts.ts` (append-only; `retoPools` concatenates them in catalog order). Endless: `reto/state` has `current`, `order` and `turnNo`; `advance` appends connected players not yet in `order` and skips the absent ones.
- `choosing → card`: the player in turn picks verdad/reto and `pickCard` draws a random index not in `used` (`v{i}`/`r{i}`; reset per kind when exhausted). Anyone else `judge`s it (done +1, else `chickens` +1) and the turn moves on; `skipTurn` if the player left.

### Mímica (`app/mimica`, `lib/mimica.ts`)

- In person, two teams (`lib/teams.ts`), chosen in the waiting room (`chooseTeam`, `shuffleTeams`; joiners can pick mid-game); needs `MIN_PER_TEAM` connected per team. `meta` has `seconds` and `turns` per team.
- `ready → acting → ready …`: the team's `actor` rotates by `acted[team]` among its connected members (`changeActor` skips). The actor starts the clock (`startActing`) and walks the words with `nextWord` (hit or pass, guarded by `wordNo`); the word is `wordFor(seed, wordNo)` over `lib/mimicaWords.ts` (append-only), shown to the actor and to the rival team, never to the actor's team. `endTurn` on timeout from any client, guarded by `turnNo`.

### Ahorcado (`app/ahorcado`, `lib/ahorcado.ts`)

- Each player in `order` sets one round's word (`chooseWord`, or `null` = the app picks from `DEFAULT_WORDS` of dibujo; then `fromApp` and the setter guesses too). Words are stored `cleanWord`ed (uppercase, no accents, Ñ and single spaces kept).
- `guessing`: guessers rotate by `turnNo`; `guess` takes a letter or the whole word (a wrong word counts as a miss). +1 per right letter, +3 to whoever completes/guesses it, +3 to the setter if `MAX_MISSES` is reached (not when the app picked). `skipGuesser` for absent ones; `nextRound` until everyone set a word.

### Sopa de letras (`app/sopa-de-letras`, `lib/sopa.ts`)

- The board is `buildSoup(seed, theme, level)` — fully deterministic (words from `lib/sopaWords.ts`, append-only; directions per `LEVELS`). Changing the generator or the lists changes existing rooms' boards.
- Players mark a word by tapping its first and last letter (`lineBetween` + `wordAt`, either direction). `claimWord` writes `found/{WORD}` = clientId if nobody did; the last word ends it (most words wins, `wins` counted). Countdown like the races (`startedAt`).

### Carreras and Carreras 3D (`app/carreras`, `app/carreras-3d`, `components/carreras`, `lib/carreras*.ts`)

- Two catalog games on the same code: route pages just pass `game` to the shared `Lobby`, `RoomClient` and `ScreenClient`. `carreras` is always `pantalla` mode, drawn top-down in 2D. `carreras3d` draws in 3D and can also run in `telefono` mode.
- Up to 4 seats (`a`–`d`, like 4 en línea's). `meta.mode` picks where the race runs. In both modes `carreras/state` changes only by transaction. It holds `racers` (seats at the start), the `startedAt` countdown, `results` (ms per seat, `reportFinish` once each) and `firstAt`. The race closes when every racer finished, or `FINISH_GRACE_MS` after the first finish, or early if the rest left (`closeRace`, any client via `useRaceCloser`). `winner` = fastest.
- `pantalla`: a screen at `/carreras/{id}/pantalla` (TV/projector; the lobby sends the creator there) is the authority. It simulates every car from `carreras/input/{clientId}` (`{s, b}`, throttled by `useInputSender`, removed `onDisconnect`; no input = coast), reports each finish and writes `carreras/live` (lap/place) for the phones. It never joins presence, so phones see the host as away and anyone can start. View: top-down 2D (`lib/carrerasDraw.ts`: hills shade and cast shadows, bridges and the cars on them are drawn over the rest, flying cars grow) for `carreras`, split-screen 3D (1, 2 or 2×2) for `carreras3d`. A/D/S and the arrows drive seats a/b for testing.
- `telefono`: no screen. Each phone runs `PhoneRace`: it simulates its own car, publishes `carreras/cars/{clientId}` (`CarPose`, ~15 Hz, tagged with `gameNo`), and draws rivals extrapolated from their pose and eased. Collisions with rivals only push your own car (`collideWithGhost`). Each phone reports its own finish.
- `lib/carrerasTrack.ts` is pure: tracks are Catmull-Rom centerlines in their own world (`def.size`, 2000–2600 wide) with walls at half the width. `progress` (arc length driven) gives laps and places. Gas is automatic (`gas: false` coasts after the finish). `stepCar`/`collideCars`/`collideWithGhost` return the hit speed (for sound and sparks). Each track has a `theme` (campo, atardecer, desierto, nieve, noche) that only changes the looks.
- Mario Kart-ish features: control points may carry a height (`hs` per sample; hills slow you down going up), `ramps` and `boosts` are `TrackFeature`s placed by control-point index (+ fraction) and a side/span across the road, resolved to `Zone`s. `groundAt` = hills + ramp wedge. Cars have `z`/`vz`/`air`/`boost`: on the road they follow it unless it drops away faster than gravity (ramp lips, sharp crests), then fly ballistically with little steering; boost pads kick the speed up to `BOOST_TOP`. Parts of a track may cross when one is `BRIDGE_CLEARANCE` higher (`trackProblem` checks that, slopes, a flat start and the world bounds); cars at different heights don't collide. Track shapes were tuned by rendering them — keep `trackProblem` null for every fixed track.
- `aleatoria` track: `getTrack("aleatoria", seed)` generates it from `carreras/state.trackSeed` (set at creation; `newTrack` while waiting, `rematch(…, true)` = "Revancha en otra pista"). The generator places points around the center in angle order and keeps the longest of the first few that pass `trackProblem` (overlap, too tight, outside, short); same seed = same track on every client. Use `trackSeedOf(meta, state)`: it's 0 for fixed tracks so they never rebuild.
- `lib/carreras3d.ts` (three.js, browser only) builds the scene from the sampled centerline, dressed by the theme (gradient sky, clouds, stars/lamps at night, snowfall, cacti…, grandstand by the start, start lights via `setStartLights`). 2D (x, y) maps to (x, height, y) and `rotation.y = -heading`. Raised road sits on earth banks, or on a deck with pillars where it passes over another part (`bridgeSamples`); ramps are striped wedges and boost pads scroll their arrows. Wheel spin, steering, pitch, brake lights, tire smoke, landing dust, boost flames and sparks are derived from the poses alone (`setPose` with velocity, `z` and `ground`), so rivals get them too (phones send `z` and lift `l` in `CarPose`); `impact` adds a spark burst and camera shake. Cameras: behind (`detras`) or cockpit (`cabina`).
- Sound (`lib/carrerasAudio.ts`): everything synthesized with Web Audio — engines with gear shifts, tire screech, hits, jumps/landings, boosts, countdown beeps, lap chimes, finish fanfare. `RaceCues` turns per-frame facts into one-off sounds. The context resumes on the first tap/key, so `RaceAudio` lives for the whole page, not per track. Muted state in `localStorage` (`carreras.sound`). The screen plays every car (panned per split view); in telefono mode each phone plays its own car, plus nearby rivals more quietly.
- Controls (`components/carreras/Controller.tsx`): buttons, or tilt (gravity projected on the screen's x axis from `deviceorientation`; iOS needs `requestPermission` from a tap and HTTPS). It works as a page panel (pantalla) or as an overlay on the 3D view (telefono).

### Arena medieval (`app/arena-medieval`, `components/arena`, `lib/arena*.ts`)

- Red vs blue (`lib/teams.ts`), `meta.size` 1–3 per team, `meta.wins` rounds to win (best of 3/5), `meta.bots` fills empty places, `meta.potions` lays potions on the floor (they come back `POTION_RESPAWN_MS` after being drunk, via `respawns` + `respawnItems`), `meta.regen` gives health back slowly (`regenerate`, called by whoever runs the fighter, after `REGEN_DELAY_MS` without a hit; `HitNote.t` is the hit time). The match copies `potions`/`regen` into the state. Teams are picked while waiting (`state.teams`, `joinArena` auto-assigns); `startMatch` fixes the `roster` (people + bots `bot0`…) for the match. Each round is last team standing; the `ROUND_SECONDS` timeout gives it to the team with more total health.
- `lib/arenaSim.ts` is pure: arena geometry (circle + mirrored pillars, red at -x), `WEAPONS` (daga, espada, hacha, maza, lanza, arco; plus escudo in the other hand), `Fighter` (walk/sprint, jump, stamina, dodge with a dash nobody can hit, acts idle → windup → strike (+ a small lunge) → recover, combos chained during the recovery that alternate the swing side (`combo`), bow draw, block/feint, flinch and guard break in `receive`; `ACTS` is append-only since poses send its index), the `meleeStrikes`/`flyArrow` hit tests, `roundItems` (seeded, mirrored weapon spots) and the bots' brain (`botInput`). Yaw 0 faces -z.
- No authority: each phone runs its own `Fighter` and writes `arena/poses/{fighterId}` (~15 Hz, with the act and when it started so others animate it). The attacker decides hits from the poses it sees and writes them with `strike` (transaction on `arena/state`: hp, kills, dropped gear, round end); the target reacts to `hits[itself].n`. Arrows: the shooter flies them and decides the hit; others draw `arena/arrows` from the launch values. The bot host (the connected person with the lowest id, once presence is loaded) runs every bot and writes for them; bot poses aren't removed on disconnect, so the next host continues from them. People gone `ABSENT_MS` mid-round are `forfeit`ed. Health, gear, items and score only change by transaction guarded by `roundKey`.
- `lib/arena3d.ts`: coliseum (sand, wall, stands with an instanced crowd that cheers, gates, pillars, torches), knights built from primitives and animated from poses, items spinning on the floor, arrows, particles. First person hides your knight and draws your hands in a second pass (`handScene`, with a swing trail; the camera tilts when strafing and widens when running/dodging); third person is over the shoulder; the fallen watch teammates. Sounds in `lib/arenaAudio.ts` (synthesized). Controls (`components/arena/Controls.tsx`): touch joystick + drag to look + buttons, or pointer-lock mouse + WASD (the pointer is only captured while you can fight, so the round-end and results buttons stay clickable).

## Gotchas

- RTDB silently drops `null`-valued keys and empty arrays/objects on write. Fields that may be null/empty may be *absent* at runtime — normalize on read as `subscribeRace` and memotest's `normalizeState` do.
- RTDB turns objects with numeric keys into arrays; key such maps with strings (memotest uses `c{index}`).
- Room codes are 6 characters and uppercased in each `[roomId]/page.tsx`; `params` is a Promise in this Next version.
