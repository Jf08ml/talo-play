import { customAlphabet } from "nanoid";

// Unambiguous uppercase alphabet (no 0/O, 1/I) for room codes people type by hand.
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const generateRoomCode = customAlphabet(roomCodeAlphabet, 6);

const playerIdAlphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const generateClientId = customAlphabet(playerIdAlphabet, 16);

export const PLAYER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function colorForClient(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = (hash * 31 + clientId.charCodeAt(i)) | 0;
  }
  return PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
}
