import { onDisconnect, onValue, ref, remove, runTransaction, update } from "firebase/database";
import { getDb } from "./firebase";
import { serverNow } from "./serverTime";
import { makeBotOpponent, type Opponent } from "./boardBot";

/**
 * «Jugar en línea» for the one-on-one games, without a backend. Each queue
 * (`rooms/_match/{queue}`: under `rooms/` for the rules, "_" so the cleanup
 * skips it) holds the people waiting: `{clientId: {at, name, color, by?, room?}}`.
 *
 * Searching first tries to claim someone fresh in one transaction (`by` = me);
 * the claimer creates the room with both seated and writes its code in the
 * entry, which the waiter follows. Nobody to claim: I wait in the queue, and
 * if nobody claims me within a few seconds I leave it and play a bot
 * (`makeBotOpponent`) — the player isn't told, by design.
 */

const FRESH_MS = 20_000;
const STALE_MS = 60_000;
/** After being claimed, how long to wait for the room before giving up on it. */
const CLAIM_WAIT_MS = 8_000;

interface Entry {
  at: number;
  name: string;
  color: string;
  by?: string;
  room?: string;
}

export interface Me {
  clientId: string;
  name: string;
  color: string;
}

export interface Found {
  roomId: string;
  /** Who made the room (the claimer, or me against a bot). */
  created: boolean;
  bot: boolean;
}

const queuePath = (queue: string) => `rooms/_match/${queue}`;

/**
 * Starts looking for a rival in `queue`; `create(vs)` makes the room against
 * `vs` and returns its code. Calls `onFound` once; returns a cancel function.
 */
export function searchMatch(
  queue: string,
  me: Me,
  create: (vs: Opponent) => Promise<string>,
  onFound: (found: Found) => void,
  onError: (err: unknown) => void
): () => void {
  const db = getDb();
  const myRef = ref(db, `${queuePath(queue)}/${me.clientId}`);
  let done = false;
  let unsub: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = (found: Found) => {
    if (done) return;
    done = true;
    unsub?.();
    clearTimeout(timer);
    onFound(found);
  };
  const fail = (err: unknown) => {
    if (done) return;
    done = true;
    unsub?.();
    clearTimeout(timer);
    remove(myRef).catch(() => {});
    onError(err);
  };

  const playBot = async () => {
    const roomId = await create(makeBotOpponent(me.name));
    finish({ roomId, created: true, bot: true });
  };

  const run = async () => {
    let claimed: { id: string; entry: Entry } | null = null;
    await runTransaction(ref(db, queuePath(queue)), (cur: Record<string, Entry> | null) => {
      claimed = null;
      const now = serverNow();
      const next: Record<string, Entry> = {};
      for (const [id, e] of Object.entries(cur ?? {})) if (e && now - (e.at ?? 0) < STALE_MS && id !== me.clientId) next[id] = e;
      const waiting = Object.entries(next)
        .filter(([, e]) => !e.by && now - e.at < FRESH_MS)
        .sort((x, y) => x[1].at - y[1].at)[0];
      if (waiting) {
        claimed = { id: waiting[0], entry: waiting[1] };
        next[waiting[0]] = { ...waiting[1], by: me.clientId };
      } else {
        next[me.clientId] = { at: now, name: me.name, color: me.color };
      }
      return next;
    });
    if (done) return;

    const rival = claimed as { id: string; entry: Entry } | null;
    if (rival) {
      const roomId = await create({ id: rival.id, player: { name: rival.entry.name, color: rival.entry.color } });
      await update(ref(db, `${queuePath(queue)}/${rival.id}`), { room: roomId });
      finish({ roomId, created: true, bot: false });
      return;
    }

    // Waiting: someone may claim me; otherwise a bot after a few seconds.
    onDisconnect(myRef).remove().catch(() => {});
    unsub = onValue(myRef, (snap) => {
      const e = snap.val() as Entry | null;
      if (e?.room) {
        remove(myRef).catch(() => {});
        finish({ roomId: e.room, created: false, bot: false });
      }
    });
    const waitMs = 3000 + Math.random() * 4000;
    timer = setTimeout(async () => {
      try {
        let claimedMeanwhile = false;
        await runTransaction(myRef, (e: Entry | null) => {
          claimedMeanwhile = !!e?.by;
          return e?.by ? e : null;
        });
        if (done) return;
        if (!claimedMeanwhile) return await playBot();
        timer = setTimeout(() => {
          remove(myRef).catch(() => {});
          playBot().catch(fail);
        }, CLAIM_WAIT_MS);
      } catch (err) {
        fail(err);
      }
    }, waitMs);
  };

  run().catch(fail);

  return () => {
    if (done) return;
    done = true;
    unsub?.();
    clearTimeout(timer);
    onDisconnect(myRef).cancel().catch(() => {});
    remove(myRef).catch(() => {});
  };
}
