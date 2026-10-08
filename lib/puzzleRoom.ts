import {
  ref,
  get,
  set,
  update,
  onValue,
  onDisconnect,
  runTransaction,
  serverTimestamp,
  type OnDisconnect,
  type Unsubscribe,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { getDb, getStorageInstance } from "./firebase";
import { generatePuzzleLayout, type PuzzleLayout } from "./puzzleGeometry";
import { makeSeed } from "./random";
import { generateRoomCode } from "./ids";
import type { TeamId } from "./teams";
import type { GameId } from "./games";

export type RoomMode = "colab" | "versus";

export interface RoomMeta {
  /** Absent on rooms created before Talo had more than one game. */
  game?: GameId;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  rows: number;
  cols: number;
  seed: number;
  createdAt: number | object;
  piecesTotal: number;
  mode: RoomMode;
}

export interface PieceState {
  x: number;
  y: number;
  placed: boolean;
  holder: string | null;
}

export type RaceStatus = "waiting" | "racing" | "finished";

// Realtime Database silently drops any key whose value is `null` on write —
// it never actually stores `startedAt: null` etc. So besides `status`
// (always a real string once written), every other field here must be
// treated as possibly *absent* at runtime, not just possibly-null.
export interface RaceState {
  status: RaceStatus;
  startedAt: number | null;
  finishedAt: Partial<Record<TeamId, number>>;
  winner: TeamId | null;
}

const EMPTY_RACE_STATE: RaceState = {
  status: "waiting",
  startedAt: null,
  finishedAt: {},
  winner: null,
};

/** Downscales an image file (if needed) and returns a JPEG blob plus its final pixel size. */
export async function prepareImage(
  file: File,
  maxDim = 1000
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width === 0 || bitmap.height === 0) {
    // A browser that can't decode this file's format (HEIC is the classic
    // case) can still resolve createImageBitmap with a 0x0 result instead of
    // rejecting — left unchecked, that 0x0 size flows all the way into each
    // piece's canvas and crashes the board on drawImage.
    throw new Error(
      "No se pudo leer esa imagen (¿está dañada o en un formato no soportado, como HEIC?). Probá con un JPG, PNG o WEBP."
    );
  }
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))),
      "image/jpeg",
      0.9
    )
  );

  return { blob, width, height };
}

function scatterPosition(
  index: number,
  total: number,
  boardW: number,
  boardH: number
): { x: number; y: number } {
  // Spread pieces in a tray band below the board, several rows deep, with jitter.
  const trayW = Math.max(boardW, 900);
  const perRow = Math.max(6, Math.ceil(Math.sqrt(total * (trayW / 260))));
  const cell = trayW / perRow;
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const jitterX = (Math.random() - 0.5) * cell * 0.4;
  const jitterY = (Math.random() - 0.5) * cell * 0.4;
  return {
    x: col * cell + cell / 2 + jitterX,
    y: boardH + 80 + row * cell + cell / 2 + jitterY,
  };
}

/** Fisher-Yates shuffle of `[0, total)`, used to scramble which tray slot each piece lands in. */
function shuffledSlots(total: number): number[] {
  const slots = Array.from({ length: total }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function piecesBasePath(roomId: string, teamId?: TeamId): string {
  return teamId ? `rooms/${roomId}/teams/${teamId}/pieces` : `rooms/${roomId}/pieces`;
}

export async function createRoom(params: {
  file: File;
  pieceCount: number;
  mode: RoomMode;
}): Promise<{ roomId: string; layout: PuzzleLayout }> {
  const { blob, width, height } = await prepareImage(params.file);

  const roomId = generateRoomCode();
  const storage = getStorageInstance();
  const imgRef = storageRef(storage, `rooms/${roomId}/image.jpg`);
  await uploadBytes(imgRef, blob, { contentType: "image/jpeg" });
  const imageUrl = await getDownloadURL(imgRef);

  const aspect = width / height;
  let cols = Math.round(Math.sqrt(params.pieceCount * aspect));
  let rows = Math.round(params.pieceCount / cols);
  cols = Math.max(2, cols);
  rows = Math.max(2, rows);

  const seed = makeSeed();
  const layout = generatePuzzleLayout(rows, cols, width, height, seed);

  const db = getDb();
  const meta: RoomMeta = {
    game: "rompecabezas",
    imageUrl,
    imageWidth: width,
    imageHeight: height,
    rows,
    cols,
    seed,
    createdAt: serverTimestamp(),
    piecesTotal: layout.pieces.length,
    mode: params.mode,
  };

  const updates: Record<string, unknown> = {};
  updates[`rooms/${roomId}/meta`] = meta;

  const teams: (TeamId | undefined)[] = params.mode === "versus" ? ["red", "blue"] : [undefined];
  for (const teamId of teams) {
    const base = piecesBasePath(roomId, teamId);
    // Shuffle which tray slot each piece lands in, so the pile doesn't mirror
    // the image's row/col order (which made pieces trivially easy to sort).
    const slots = shuffledSlots(layout.pieces.length);
    layout.pieces.forEach((piece, i) => {
      const pos = scatterPosition(slots[i], layout.pieces.length, width, height);
      const state: PieceState = { x: pos.x, y: pos.y, placed: false, holder: null };
      updates[`${base}/${piece.id}`] = state;
    });
  }

  if (params.mode === "versus") {
    updates[`rooms/${roomId}/race`] = EMPTY_RACE_STATE;
  }

  await update(ref(db), updates);

  return { roomId, layout };
}

export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const db = getDb();
  const snap = await get(ref(db, `rooms/${roomId}/meta`));
  if (!snap.exists()) return null;
  const meta = snap.val() as Partial<RoomMeta>;
  return { ...meta, mode: meta.mode ?? "colab" } as RoomMeta;
}

export function subscribePieces(
  roomId: string,
  cb: (pieces: Record<string, PieceState>) => void,
  teamId?: TeamId
): Unsubscribe {
  const db = getDb();
  return onValue(ref(db, piecesBasePath(roomId, teamId)), (snap) => {
    cb((snap.val() as Record<string, PieceState>) ?? {});
  });
}

export function updatePiece(
  roomId: string,
  pieceId: string,
  patch: Partial<PieceState>,
  teamId?: TeamId
): Promise<void> {
  const db = getDb();
  return update(ref(db, `${piecesBasePath(roomId, teamId)}/${pieceId}`), patch);
}

export function setPiece(
  roomId: string,
  pieceId: string,
  state: PieceState,
  teamId?: TeamId
): Promise<void> {
  const db = getDb();
  return set(ref(db, `${piecesBasePath(roomId, teamId)}/${pieceId}`), state);
}

// Tracks the active onDisconnect handle per piece this client currently
// holds, so it can be cancelled once the drag ends cleanly (otherwise a
// stale handle could clear a *different* player's hold on that same piece
// much later, whenever this browser tab eventually disconnects).
const heldDisconnectHandlers = new Map<string, OnDisconnect>();

/** Marks a piece as held by this client, and arranges for the hold to be released automatically if the tab disconnects mid-drag. */
export async function holdPiece(
  roomId: string,
  pieceId: string,
  clientId: string,
  teamId?: TeamId
): Promise<void> {
  const db = getDb();
  const pieceRef = ref(db, `${piecesBasePath(roomId, teamId)}/${pieceId}`);
  const handle = onDisconnect(pieceRef);
  await handle.update({ holder: null });
  heldDisconnectHandlers.set(`${teamId ?? ""}:${pieceId}`, handle);
  await update(pieceRef, { holder: clientId });
}

/** Releases a held piece with its final state, cancelling the pending onDisconnect cleanup. */
export async function releasePiece(
  roomId: string,
  pieceId: string,
  finalState: Partial<PieceState>,
  teamId?: TeamId
): Promise<void> {
  const db = getDb();
  const pieceRef = ref(db, `${piecesBasePath(roomId, teamId)}/${pieceId}`);
  const key = `${teamId ?? ""}:${pieceId}`;
  const handle = heldDisconnectHandlers.get(key);
  if (handle) {
    heldDisconnectHandlers.delete(key);
    await handle.cancel();
  }
  await update(pieceRef, finalState);
}

// ---- Versus mode: race state -----------------------------------------

export function subscribeRace(
  roomId: string,
  cb: (race: RaceState) => void
): Unsubscribe {
  const db = getDb();
  return onValue(ref(db, `rooms/${roomId}/race`), (snap) => {
    const raw = snap.val() as Partial<RaceState> | null;
    // Normalize here so every consumer can rely on the full shape — RTDB
    // drops null-valued keys on write, so `finishedAt` in particular may be
    // entirely absent even though the type says it's always an object.
    cb(raw ? { ...EMPTY_RACE_STATE, ...raw, finishedAt: raw.finishedAt ?? {} } : EMPTY_RACE_STATE);
  });
}

/** Flips the race from "waiting" to "racing", exactly once, no matter how many players click start. */
export async function startRace(roomId: string): Promise<void> {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/race`), (current: RaceState | null) => {
    if (!current || current.status !== "waiting") return current;
    return { ...current, status: "racing", startedAt: Date.now() };
  });
}

/**
 * Records that `team` finished (idempotent), and claims the win for whichever
 * team gets here first — safe even if multiple teammates report it at once.
 */
export async function reportTeamFinished(roomId: string, team: TeamId): Promise<void> {
  const db = getDb();
  await runTransaction(ref(db, `rooms/${roomId}/race`), (current: RaceState | null) => {
    if (!current) return current;
    if (current.finishedAt?.[team]) return current; // already recorded
    const next: RaceState = {
      ...current,
      finishedAt: { ...current.finishedAt, [team]: Date.now() },
    };
    if (!next.winner) {
      next.winner = team;
      next.status = "finished";
    }
    return next;
  });
}
