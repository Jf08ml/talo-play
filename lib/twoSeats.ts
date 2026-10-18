/**
 * Seat handling shared by the one-on-one board games (Otelo, Backgammon):
 * seats `a`/`b` hold client ids ("" = empty); everyone else watches. Pure
 * functions over the state, meant to run inside each game's transaction.
 * Joining before the game auto-sits you; a seat whose player left can be
 * taken, also mid-game by a spectator.
 */

export type Seat2 = "a" | "b";
export const SEATS2: Seat2[] = ["a", "b"];

export interface SeatPlayer {
  name: string;
  color: string;
}

interface Seated {
  status: string;
  seats: Record<Seat2, string>;
  players: Record<string, SeatPlayer>;
}

export const otherSeat = (s: Seat2): Seat2 => (s === "a" ? "b" : "a");

export function seatOf2(state: Pick<Seated, "seats">, clientId: string): Seat2 | null {
  if (!clientId) return null;
  if (state.seats.a === clientId) return "a";
  if (state.seats.b === clientId) return "b";
  return null;
}

/** Registers the player and, before the game, sits them in a free seat. */
export function joinSeats<S extends Seated>(s: S, clientId: string, player: SeatPlayer): S | null {
  const known = s.players[clientId];
  const free: Seat2 | null = !s.seats.a ? "a" : !s.seats.b ? "b" : null;
  const sit = s.status === "waiting" && !seatOf2(s, clientId) && free;
  if (!sit && known?.name === player.name && known?.color === player.color) return null;
  return {
    ...s,
    players: { ...s.players, [clientId]: player },
    seats: sit ? { ...s.seats, [sit]: clientId } : s.seats,
  };
}

/**
 * Takes a seat that is free or whose player left (`expectedOccupant` is who I
 * saw there). Mid-game, only a left player's seat, by someone without one.
 */
export function takeSeatIn<S extends Seated>(s: S, clientId: string, seat: Seat2, expectedOccupant: string): S | null {
  if (s.seats[seat] !== expectedOccupant || s.seats[seat] === clientId) return null;
  const mine = seatOf2(s, clientId);
  if (s.status !== "waiting" && (mine || !expectedOccupant)) return null;
  const seats = { ...s.seats, [seat]: clientId };
  if (mine) seats[mine] = "";
  return { ...s, seats };
}

export function leaveSeatIn<S extends Seated>(s: S, clientId: string): S | null {
  const mine = seatOf2(s, clientId);
  if (s.status !== "waiting" || !mine) return null;
  return { ...s, seats: { ...s.seats, [mine]: "" } };
}

export function swapSeatsIn<S extends Seated>(s: S): S | null {
  return s.status === "waiting" ? { ...s, seats: { a: s.seats.b, b: s.seats.a } } : null;
}
