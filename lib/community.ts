import { onValue, push, ref, remove, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import { getDb } from "./firebase";

/**
 * The community page (`app/ideas`): votes for the next game and private
 * feedback. Both live outside `rooms/` with their own rules in
 * `database.rules.json`:
 * - `community/votes/{candidate}/{clientId}` = true — public, one per browser
 *   and candidate (a toggle). Informal: nothing stops someone from making up
 *   client ids, so read it as a hint, not an election.
 * - `feedback/{pushId}` — write-only; nobody can read it from the app, only the
 *   Firebase console.
 */

export interface Candidate {
  id: string;
  title: string;
  text: string;
}

/** Games people can vote for. Ids are stored with the votes: keep them; drop a candidate once it ships. */
export const CANDIDATES: Candidate[] = [
  { id: "escoba", title: "Escoba de 15", text: "El clásico de cartas: levantar sumando 15." },
  { id: "burako", title: "Burako", text: "Escaleras y piernas con fichas, en parejas." },
  { id: "poker", title: "Póker", text: "Texas hold'em con fichas de mentira." },
  { id: "bingo", title: "Bingo", text: "Cartones en cada celu y alguien que canta." },
  { id: "quiensoy", title: "¿Quién soy?", text: "Tenés un personaje en la frente y preguntás por sí o por no." },
  { id: "palabras", title: "Palabras cruzadas", text: "Armar palabras en un tablero con letras al azar." },
  { id: "sudoku", title: "Sudoku en equipo", text: "Uno compartido, o una carrera a ver quién termina." },
  { id: "hockey", title: "Hockey de mesa", text: "Uno contra uno, rápido, con el dedo." },
  { id: "minigolf", title: "Minigolf", text: "Hoyos por turnos, gana el de menos golpes." },
  { id: "damaschinas", title: "Damas chinas", text: "La estrella de seis puntas, de 2 a 6." },
];

export type Votes = Record<string, Record<string, true>>;

export function subscribeVotes(cb: (votes: Votes) => void): Unsubscribe {
  return onValue(ref(getDb(), "community/votes"), (snap) => cb((snap.val() as Votes | null) ?? {}));
}

export function setVote(candidate: string, clientId: string, on: boolean): Promise<void> {
  const r = ref(getDb(), `community/votes/${candidate}/${clientId}`);
  return on ? set(r, true) : remove(r);
}

export const FEEDBACK_KINDS = [
  { id: "juego", label: "Un juego nuevo" },
  { id: "mejora", label: "Una mejora" },
  { id: "error", label: "Algo anda mal" },
  { id: "otro", label: "Otra cosa" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];

export const FEEDBACK_MAX = 1000;
export const CONTACT_MAX = 80;

export interface Feedback {
  kind: FeedbackKind;
  text: string;
  /** How to reach them back (email, Instagram…), optional. */
  contact?: string;
  name?: string;
  clientId: string;
  uid?: string;
}

/** Between two messages from the same tab, against flooding. */
const MIN_GAP_MS = 20_000;
let lastSent = 0;

export async function sendFeedback(f: Feedback): Promise<"sent" | "wait"> {
  if (Date.now() - lastSent < MIN_GAP_MS) return "wait";
  const data: Record<string, unknown> = {
    kind: f.kind,
    text: f.text.trim().slice(0, FEEDBACK_MAX),
    clientId: f.clientId,
    page: typeof location !== "undefined" ? location.pathname.slice(0, 100) : "",
    ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
    at: serverTimestamp(),
  };
  const contact = f.contact?.trim().slice(0, CONTACT_MAX);
  if (contact) data.contact = contact;
  if (f.name) data.name = f.name.slice(0, 24);
  if (f.uid) data.uid = f.uid;
  await push(ref(getDb(), "feedback"), data);
  lastSent = Date.now();
  return "sent";
}
