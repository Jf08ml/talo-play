"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Skull, Zap } from "lucide-react";
import {
  FINISH_GRACE_MS,
  botHost,
  closeRound,
  isBot,
  playerInfo,
  reportFinish,
  reportOut,
  sendAttack,
  sendBoard,
  subscribeAttacks,
  subscribeBoards,
  type Attack,
  type LadriState,
  type RemoteBoard,
} from "@/lib/ladrillazo";
import { Board, DANGER_ROW, botInput, encodeBalls, makePaddle, newBrain, type BotBrain, type Events } from "@/lib/ladrillazoSim";
import { attackField, attackRow, garbageRow, levelCells, roomLevel } from "@/lib/ladrillazoLevels";
import { burst, stepParticles, type Particle } from "@/lib/ladrillazoDraw";
import { mulberry32 } from "@/lib/random";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { useCountdownTicks } from "@/hooks/useSound";
import { useWakeLock } from "@/components/carreras/Controller";
import Field, { Countdown, newInput, useEventSounds, type FieldInput, type Frame } from "./Field";
import MiniBoard from "./MiniBoard";
import { GoalPill, Lives, ProgressBar, formatTime } from "./Hud";
import { Overlay } from "./SoloGame";

const SEND_MS = 150;
const ATTACK_LIVES = 3;

/** Seconds between the attack's periodic rows: shorter as the game goes on. */
function dropGap(k: number): number {
  return Math.max(4000, 11000 - k * 350);
}

/** How many periodic rows are due after `elapsed` ms. */
function dropsBy(elapsed: number): number {
  let k = 0;
  let t = dropGap(0);
  while (t <= elapsed) {
    k++;
    t += dropGap(k);
  }
  return k;
}

/** Rows sent for a combo (bricks broken between two paddle hits). */
function comboRows(combo: number): number {
  return combo >= 12 ? 3 : combo >= 8 ? 2 : combo >= 4 ? 1 : 0;
}

/** A board this phone runs: mine, or a bot's if I'm the bot host. */
interface Runner {
  id: string;
  board: Board;
  brain: BotBrain | null;
  drops: number;
  lastCells: string;
  lastSend: number;
  /** Last incoming attack applied. */
  applied: string;
  retries: number;
  /** Finished (race) or knocked out (attack): no more steps. */
  stopped: boolean;
}

/**
 * Race and attack: everyone plays their own board; this phone runs mine
 * (and the bots, if it's the bot host) and shows the rest as small previews.
 */
export default function RaceGame({
  roomId,
  state,
  myId,
  presence,
  presenceLoaded,
}: {
  roomId: string;
  state: LadriState;
  myId: string;
  presence: PresenceMap;
  presenceLoaded: boolean;
}) {
  const g = state.gameNo;
  const attack = state.mode === "ataque";
  const level = useMemo(() => roomLevel(state.level, state.seed), [state.level, state.seed]);
  const startCells = useMemo(() => (attack ? attackField(state.seed) : levelCells(level)), [attack, state.seed, level]);
  const goal = attack ? "ninguno" : level.goal;
  const lives = attack ? ATTACK_LIVES : level.balls;
  const playing = state.roster.includes(myId);

  const [boards, setBoards] = useState<Record<string, RemoteBoard>>({});
  const boardsRef = useRef(boards);
  const attacksRef = useRef<Record<string, Record<string, Attack>>>({});
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const runners = useRef(new Map<string, Runner>());
  const particles = useRef<Particle[]>([]);
  const input = useRef<FieldInput>(newInput());
  const sound = useEventSounds();
  const [hud, setHud] = useState({ score: 0, lives, progress: 0, danger: 0, retries: 0 });
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const lastHud = useRef(0);
  useWakeLock();

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);
  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);

  useEffect(() => {
    runners.current = new Map();
    particles.current = [];
    return subscribeBoards(roomId, g, setBoards);
  }, [roomId, g]);
  useEffect(() => (attack ? subscribeAttacks(roomId, g, (a) => (attacksRef.current = a)) : undefined), [roomId, g, attack]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const newRunner = (id: string, bot: boolean, remote?: RemoteBoard): Runner => {
    const b = new Board(remote?.c ?? startCells, [makePaddle(id)], { goal, lives: remote?.l ?? lives });
    if (remote) {
      b.score = remote.s ?? 0;
      b.paddles[0].x = remote.p ?? b.paddles[0].x;
      b.total = remote.c ? new Board(startCells, [], { goal, lives }).total : b.total;
      b.left = b.count();
    }
    b.serve(id, bot ? 1 : 3);
    const s = stateRef.current;
    return {
      id,
      board: b,
      brain: bot ? newBrain(0.5) : null,
      drops: remote ? dropsBy(serverNow() - s.startedAt) : 0,
      lastCells: "",
      lastSend: 0,
      applied: remote?.a ?? "",
      retries: remote?.r ?? 0,
      stopped: s.results[id] !== undefined || !!s.out[id],
    };
  };

  /** Runs one board for a frame; returns its events. */
  const stepRunner = (r: Runner, dt: number, now: number): Events | null => {
    const s = stateRef.current;
    if (r.stopped) return null;
    const b = r.board;
    const inp = r.brain ? botInput(b, r.id, r.brain, dt) : { ...input.current };
    if (!r.brain) input.current.launch = false;
    b.step(dt, { [r.id]: inp });
    const ev = b.takeEvents();

    if (attack) {
      // The wall comes down on schedule; the same rows for everyone.
      const due = dropsBy(now - s.startedAt);
      while (r.drops < due && !b.over) {
        b.pushRows([attackRow(mulberry32(s.seed + 77 + r.drops))]);
        r.drops++;
      }
      // Rows sent by rivals, in order.
      const incoming = Object.entries(attacksRef.current[r.id] ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      for (const [key, a] of incoming) {
        if (key <= r.applied) continue;
        r.applied = key;
        const rand = mulberry32(key.length * 131 + key.charCodeAt(key.length - 1));
        b.pushRows(Array.from({ length: Math.min(3, a.r) }, () => garbageRow(rand)));
        if (!r.brain) setToast({ text: `¡${playerInfo(s, a.by).name} te mandó ${a.r === 1 ? "una fila" : `${a.r} filas`}!`, key: now });
      }
      // My combos go to someone still standing.
      for (const c of ev.combos) {
        const rows = comboRows(c);
        if (!rows) continue;
        const targets = s.roster.filter((id) => id !== r.id && !s.out[id] && (isBot(id) || id in presenceRef.current.presence));
        if (!targets.length) continue;
        const victim = targets[Math.floor(Math.random() * targets.length)];
        sendAttack(roomId, g, victim, r.id, rows);
        if (!r.brain) setToast({ text: `¡Combo de ${c}! Le mandaste ${rows === 1 ? "una fila" : `${rows} filas`} a ${playerInfo(s, victim).name}`, key: now });
      }
      if (b.over) {
        r.stopped = true;
        reportOut(roomId, g, r.id).catch(console.error);
      }
    } else if (b.done) {
      r.stopped = true;
      reportFinish(roomId, g, r.id).catch(console.error);
    } else if (b.over) {
      // Out of balls in a race: the level starts over, the clock keeps going.
      const fresh = new Board(startCells, [makePaddle(r.id)], { goal, lives });
      fresh.paddles[0].x = b.paddles[0].x;
      fresh.serve(r.id, r.brain ? 1 : 3);
      r.board = fresh;
      r.retries++;
      r.lastCells = "";
      if (!r.brain) setToast({ text: "Sin pelotas: el nivel vuelve a empezar", key: now });
    }
    return ev;
  };

  const publish = (r: Runner, now: number) => {
    if (now - r.lastSend < SEND_MS) return;
    r.lastSend = now;
    const b = r.board;
    const cells = b.cellString();
    const changed = cells !== r.lastCells;
    r.lastCells = cells;
    const p = b.paddles[0];
    sendBoard(
      roomId,
      g,
      r.id,
      { p: Math.round(p.x * 10) / 10, w: p.hw, b: encodeBalls(b.balls), l: b.lives, s: b.score, pr: Math.round(b.progress() * 100) / 100, t: now, a: r.applied, r: r.retries },
      changed ? cells : undefined
    );
  };

  const frame = (dt: number): Frame => {
    const s = stateRef.current;
    const now = serverNow();
    const live = s.status === "playing" && s.gameNo === g && now >= s.startedAt;
    const { presence: pres, presenceLoaded: loaded } = presenceRef.current;

    let mine = runners.current.get(myId);
    if (!mine && playing) {
      mine = newRunner(myId, false, boardsRef.current[myId]);
      runners.current.set(myId, mine);
    }

    // Bots: run by the connected person with the lowest id.
    const host = loaded && botHost(Object.keys(pres)) === myId;
    for (const id of s.roster) {
      if (!isBot(id)) continue;
      if (!host) {
        runners.current.delete(id);
        continue;
      }
      if (!runners.current.has(id)) runners.current.set(id, newRunner(id, true, boardsRef.current[id]));
    }

    if (live) {
      for (const r of runners.current.values()) {
        const ev = stepRunner(r, dt, now);
        if (ev && r.id === myId) {
          for (const { i, ch } of ev.broke) burst(particles.current, i, ch, ch === "o" ? 14 : 6);
          if (ev.broke.some((b) => b.ch === "o")) sound("good");
          else if (ev.booms.length) sound("capture");
          else if (ev.broke.length) sound("place");
          if (ev.paddle) sound("tick");
          if (ev.power.length) sound("flip");
          if (ev.lost.length && !r.board.balls.length) sound("bad");
        }
        publish(r, now);
      }
    } else if (mine && mine.lastSend === 0) {
      publish(mine, now);
    }
    stepParticles(particles.current, dt);

    if (mine && performance.now() - lastHud.current > 150) {
      lastHud.current = performance.now();
      const low = mine.board.lowestRow();
      setHud({
        score: mine.board.score,
        lives: mine.board.lives,
        progress: mine.board.progress(),
        danger: attack ? Math.max(0, Math.min(1, (low - 8) / (DANGER_ROW - 9))) : 0,
        retries: mine.retries,
      });
    }

    const b = mine?.board;
    return {
      view: {
        cells: b ? b.cellString() : startCells,
        paddles: b ? [{ x: b.paddles[0].x, hw: b.paddles[0].hw, side: 1, color: "#FFD400", me: true }] : [],
        balls: b?.balls ?? [],
        drops: b?.drops,
        danger: attack,
      },
      particles: particles.current,
    };
  };

  // Anyone closes the round once it's decided (the transaction keeps it once).
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = setInterval(() => {
      const s = stateRef.current;
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      if (!loaded || s.status !== "playing") return;
      const now = serverNow();
      if (now < s.startedAt) return;
      const gone = s.roster.filter((p) => !isBot(p) && !(p in pres));
      const peopleHere = s.roster.some((p) => !isBot(p) && p in pres);
      const prog: Record<string, number> = {};
      for (const p of s.roster) {
        const local = runners.current.get(p)?.board;
        const remote = boardsRef.current[p];
        prog[p] = attack ? local?.score ?? remote?.s ?? 0 : s.results[p] !== undefined ? 100 : Math.round(((local?.progress() ?? remote?.pr) || 0) * 100);
      }
      let close = !peopleHere || (s.endsAt > 0 && now > s.endsAt);
      if (attack) {
        const alive = s.roster.filter((p) => !s.out[p] && !gone.includes(p));
        close ||= s.roster.length > 1 ? alive.length <= 1 : alive.length === 0;
      } else {
        close ||= s.roster.every((p) => s.results[p] !== undefined || gone.includes(p));
        close ||= s.firstAt > 0 && now > s.firstAt + FINISH_GRACE_MS;
      }
      if (close) closeRound(roomId, g, prog, gone).catch(console.error);
    }, 1000);
    return () => clearInterval(id);
  }, [state.status, roomId, g, attack]);

  const now = useServerNow(true, 250);
  const countdown = now && now < state.startedAt ? Math.ceil((state.startedAt - now) / 1000) : 0;
  useCountdownTicks(countdown || null, 3);
  const elapsed = now > state.startedAt ? (now - state.startedAt) / 1000 : 0;
  const graceLeft = state.firstAt ? Math.max(0, (state.firstAt + FINISH_GRACE_MS - now) / 1000) : null;

  const myResult = state.results[myId];
  const myPlace = myResult !== undefined ? Object.values(state.results).filter((ms) => ms <= myResult).length : 0;
  const outAt = state.out[myId];
  const outPlace = outAt ? state.roster.length - Object.values(state.out).filter((t) => t < outAt).length : 0;
  const rivals = state.roster.filter((id) => id !== myId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-3 pt-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {attack ? "Ataque" : `Carrera · ${level.name}`}
            <span className="ml-2 font-mono text-white/60">{formatTime(elapsed)}</span>
          </p>
          {attack ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/70">
              <Zap className="h-3 w-3 text-talo-hero" /> Romper muchos seguidos le manda filas a otro
            </span>
          ) : (
            <GoalPill goal={level.goal} />
          )}
        </div>
        {playing && (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-lg leading-none text-white">{hud.score}</span>
            <Lives lives={hud.lives} />
          </div>
        )}
      </div>
      {playing && (
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 py-1.5 text-xs text-white/60">
          {attack ? (
            <>
              <span>Peligro</span>
              <ProgressBar value={hud.danger} color={hud.danger > 0.7 ? "#FF3B30" : "#FF7A1A"} />
            </>
          ) : (
            <>
              <span className="w-9 font-mono">{Math.round(hud.progress * 100)}%</span>
              <ProgressBar value={hud.progress} />
              {graceLeft !== null && myResult === undefined && <span className="shrink-0 font-mono text-[#FF7A1A]">Quedan {Math.ceil(graceLeft)} s</span>}
            </>
          )}
        </div>
      )}

      {rivals.length > 0 && (
        <div className="mx-auto flex w-full max-w-3xl gap-2 overflow-x-auto px-3 pb-2">
          {rivals.map((id) => {
            const info = playerInfo(state, id);
            const rb = boards[id];
            const away = !isBot(id) && presenceLoaded && !(id in presence);
            const res = state.results[id];
            return (
              <div key={id} className={`flex shrink-0 flex-col items-center gap-0.5 ${away || state.out[id] ? "opacity-40" : ""}`}>
                <MiniBoard board={rb} fallbackCells={startCells} color={info.color} width={playing ? 52 : 96} danger={attack} />
                <span className="max-w-[64px] truncate text-[10px] font-bold" style={{ color: info.color }}>
                  {info.name}
                </span>
                <span className="text-[10px] text-white/50">
                  {res !== undefined ? (
                    <span className="inline-flex items-center gap-0.5 text-talo-hero">
                      <Flag className="h-2.5 w-2.5" /> {formatTime(res / 1000)}
                    </span>
                  ) : state.out[id] ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Skull className="h-2.5 w-2.5" /> afuera
                    </span>
                  ) : attack ? (
                    `${rb?.s ?? 0} pts`
                  ) : (
                    `${Math.round((rb?.pr ?? 0) * 100)}%`
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {playing ? (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
          <Field frame={frame} input={input} paddleX={() => runners.current.get(myId)?.board.paddles[0].x ?? 10} controls={!myResult && !outAt}>
            <Countdown seconds={countdown} />
            {toast && (
              <p key={toast.key} className="animate-celebration-in pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-black/70 px-3 py-1.5 text-center text-xs font-bold text-white">
                {toast.text}
              </p>
            )}
            {myResult !== undefined && (
              <Overlay>
                <p className="font-display text-3xl text-white">{myPlace === 1 ? "¡Primero!" : `Llegaste ${myPlace}º`}</p>
                <p className="text-sm text-white/70">
                  {formatTime(myResult / 1000)}
                  {hud.retries > 0 && ` · ${hud.retries} ${hud.retries === 1 ? "reintento" : "reintentos"}`}
                </p>
                <p className="text-xs text-white/50">Esperando a los demás…</p>
              </Overlay>
            )}
            {outAt > 0 && (
              <Overlay>
                <p className="font-display text-3xl text-white">¡Quedaste afuera!</p>
                <p className="text-sm text-white/70">Quedaste {outPlace}º · {hud.score} puntos</p>
                <p className="text-xs text-white/50">Mirá cómo sigue arriba.</p>
              </Overlay>
            )}
          </Field>
        </div>
      ) : (
        <p className="px-4 pb-4 text-center text-sm text-white/60">Estás mirando: en la próxima partida jugás vos también.</p>
      )}
    </div>
  );
}
