"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  botHost,
  coopWon,
  forfeit,
  initBall,
  isBot,
  loseLife,
  playerInfo,
  scoreGoal,
  sendBall,
  sendCells,
  sendPad,
  subscribeShared,
  type LadriState,
  type SharedBall,
  type SharedField,
} from "@/lib/ladrillazo";
import { BALL_R, BOTTOM_Y, Board, COLS, HW, START_SPEED, botInput, landingX, makePaddle, newBrain, type Ball, type BotBrain, type Events, type Paddle } from "@/lib/ladrillazoSim";
import { duelField, levelCells, roomLevel } from "@/lib/ladrillazoLevels";
import { burst, stepParticles, type Particle } from "@/lib/ladrillazoDraw";
import { serverNow } from "@/lib/serverTime";
import type { PresenceMap } from "@/lib/presence";
import { useServerNow } from "@/hooks/useServerNow";
import { ladriAudio, playEvents } from "@/lib/ladrillazoAudio";
import { useWakeLock } from "@/components/carreras/Controller";
import Field, { Countdown, newInput, useCountdownBeeps, type FieldInput, type Frame } from "./Field";
import { GoalPill, Lives, ProgressBar } from "./Hud";

const BALL_SEND_MS = 100;
const PAD_SEND_MS = 60;
const SERVE_DELAY = 1.6;
/** A duel rival gone this long loses. */
const FORFEIT_MS = 10_000;

/** Paddles for the roster: the duel's two ends, or the co-op's lanes along the bottom. */
function paddlesFor(roster: string[], duel: boolean): Paddle[] {
  if (duel) return [makePaddle(roster[0], 1), makePaddle(roster[1] ?? "", -1)];
  const n = Math.max(1, roster.length);
  const w = COLS / n;
  const hw = n >= 3 ? 1.6 : n === 2 ? 1.9 : HW;
  return roster.map((id, i) => makePaddle(id, 1, [i * w, (i + 1) * w], hw));
}

function toNet(b: Ball, owner: string, k: number, board: Board): SharedBall {
  const now = serverNow();
  return {
    x: Math.round(b.x * 1000) / 1000,
    y: Math.round(b.y * 1000) / 1000,
    vx: Math.round(b.vx * 1000) / 1000,
    vy: Math.round(b.vy * 1000) / 1000,
    sp: b.speed,
    o: owner,
    k,
    st: b.stuck ? 1 : 0,
    off: b.stuckOff,
    sa: b.stuck ? Math.round(now + (b.serveAt - board.time) * 1000) : 0,
    lh: b.lastHit,
    t: now,
  };
}

function fromNet(n: SharedBall, board: Board): Ball {
  return {
    x: n.x,
    y: n.y,
    vx: n.vx,
    vy: n.vy,
    speed: n.sp || START_SPEED,
    stuck: n.st ? n.o : "",
    stuckOff: n.off ?? 0,
    serveAt: board.time + Math.max(0, (n.sa - serverNow()) / 1000),
    lastHit: n.lh || n.o,
  };
}

/** Steps a board's ball forward `seconds` (catching up a snapshot), in small steps. */
function advance(board: Board, seconds: number) {
  let left = Math.min(0.6, Math.max(0, seconds));
  while (left > 0) {
    const h = Math.min(1 / 60, left);
    board.step(h, {});
    left -= h;
  }
}

/**
 * The duel and the co-op: one field for everyone. The ball is stepped only
 * by its owner's phone (the player it's heading to), which writes it for the
 * rest and hands it over when it turns around; the others draw it moving on
 * from the last snapshot.
 */
export default function SharedGame({
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
  const duel = state.mode === "duelo";
  const roster = state.roster;
  const rosterKey = roster.join(",");
  const level = useMemo(() => roomLevel(state.level, state.seed), [state.level, state.seed]);
  const cells = useMemo(() => (duel ? duelField(state.seed) : levelCells(level)), [duel, state.seed, level]);
  const playing = roster.includes(myId);
  const flip = duel && roster[1] === myId;

  // The field as this phone sees it, rebuilt for each game (outside render: it's mutated every frame).
  const boardRef = useRef<{ key: string; board: Board } | null>(null);
  const boardKey = `${g}|${rosterKey}`;
  const getBoard = () => {
    if (boardRef.current?.key !== boardKey) {
      const board = new Board(cells, paddlesFor(rosterKey.split(","), duel), {
        goal: duel ? "ninguno" : level.goal,
        lives: 99,
        openTop: duel,
        powerups: false,
        selfServe: false,
      });
      boardRef.current = { key: boardKey, board };
    }
    return boardRef.current.board;
  };
  const ghost = useRef<Board | null>(null);
  const fieldRef = useRef<SharedField>({ ball: null, cells: {}, pads: {} });
  const stateRef = useRef(state);
  const presenceRef = useRef({ presence, presenceLoaded });
  const run = useRef({ owner: "", k: 0, lastT: 0, lastSend: 0, running: false });
  const brains = useRef(new Map<string, BotBrain>());
  const padSent = useRef(new Map<string, { x: number; at: number }>());
  const particles = useRef<Particle[]>([]);
  const input = useRef<FieldInput>(newInput());
  const lastHit = useRef("");
  const [progress, setProgress] = useState(0);
  const lastHud = useRef(0);
  const absentSince = useRef(0);
  useWakeLock();

  useEffect(() => {
    stateRef.current = state;
    presenceRef.current = { presence, presenceLoaded };
  }, [state, presence, presenceLoaded]);

  useEffect(() => {
    run.current = { owner: "", k: 0, lastT: 0, lastSend: 0, running: false };
    particles.current = [];
    return subscribeShared(roomId, g, (f) => {
      const board = getBoard();
      fieldRef.current = f;
      for (const [key, ch] of Object.entries(f.cells)) {
        const i = Number(key.slice(1));
        if (board.cells[i] !== undefined && board.cells[i] !== ch) {
          // Someone else's ball broke it: the same sound as if it were mine.
          if (ch === "." || ch === "b") burst(particles.current, i, board.cells[i]);
          if (board.cells[i] === "x") ladriAudio.bomb();
          else if (board.cells[i] === "B") ladriAudio.hard();
          else ladriAudio.brick(1 + Math.floor(Math.random() * 5));
          board.cells[i] = ch;
        }
      }
      // A paddle hit seen in someone else's snapshot.
      const hitBy = f.ball && !f.ball.st ? f.ball.lh + ":" + Math.sign(f.ball.vy) : "";
      if (hitBy && lastHit.current && hitBy !== lastHit.current && f.ball?.o !== myId) ladriAudio.paddle(0);
      lastHit.current = hitBy;
      board.left = board.count();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getBoard follows g and the roster.
  }, [roomId, g, boardKey]);

  // The first serve, from the first player (or the bot host for a bot).
  useEffect(() => {
    if (!playing || !presenceLoaded) return;
    const first = roster[0];
    const host = botHost(Object.keys(presence));
    if (first !== myId && !(isBot(first) && host === myId)) return;
    const p = getBoard().paddle(first);
    if (!p) return;
    initBall(roomId, g, {
      x: p.x,
      y: BOTTOM_Y - BALL_R,
      vx: 0,
      vy: 0,
      sp: START_SPEED,
      o: first,
      k: 1,
      st: 1,
      off: 0,
      sa: state.startedAt + 1500,
      lh: first,
      t: serverNow(),
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getBoard follows g and the roster.
  }, [playing, presenceLoaded, presence, roster, myId, boardKey, roomId, g, state.startedAt]);

  /** Who steps the ball for `owner`: themselves, or the bot host for a bot or someone gone. */
  const runnerOf = (owner: string) => {
    const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
    if (isBot(owner) || (loaded && !(owner in pres))) return loaded ? botHost(Object.keys(pres)) : "";
    return owner;
  };

  /** The player the ball is heading to. */
  const ownerFor = (b: Ball, current: string): string => {
    if (b.stuck) return b.stuck;
    if (duel) return b.vy > 0 ? roster[0] : roster[1];
    if (b.vy <= 0) return current;
    const x = landingX(b, BOTTOM_Y - BALL_R);
    const lane = Math.min(roster.length - 1, Math.floor((x / COLS) * roster.length));
    return roster[lane] ?? current;
  };

  const writeBall = (b: Ball) => {
    const net = toNet(b, run.current.owner, run.current.k, getBoard());
    run.current.lastT = net.t;
    run.current.lastSend = performance.now();
    sendBall(roomId, g, net);
  };

  const handleEvents = (ev: Events, mine: boolean) => {
    const board = getBoard();
    if (ev.broke.length) {
      const patch: Record<number, string> = {};
      for (const { i, ch } of ev.broke) {
        patch[i] = board.cells[i];
        burst(particles.current, i, ch, 8);
      }
      if (mine) sendCells(roomId, g, patch);
    }
    playEvents({ ...ev, lost: [] }, board.combo, 1);
  };

  const frame = (dt: number): Frame => {
    const board = getBoard();
    const s = stateRef.current;
    const now = serverNow();
    const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
    const host = loaded && botHost(Object.keys(pres)) === myId;
    const net = fieldRef.current;
    const live = s.status === "playing" && s.gameNo === g;

    // Paddles: mine from my hands, bots from their brain (bot host), the rest from the network.
    const inputs: Record<string, ReturnType<typeof botInput> | undefined> = {};
    for (const p of board.paddles) {
      if (p.id === myId && playing) {
        inputs[p.id] = { ...input.current };
      } else if (isBot(p.id) && host) {
        let brain = brains.current.get(p.id);
        if (!brain) brains.current.set(p.id, (brain = newBrain(0.55)));
        inputs[p.id] = botInput(board, p.id, brain, dt);
      } else {
        const x = net.pads[p.id];
        if (typeof x === "number") p.x += (x - p.x) * Math.min(1, dt * 18);
      }
    }
    input.current.launch = false;

    // Step my paddle (and the bots') even when the ball isn't mine.
    const ball = net.ball;
    const r = run.current;
    const runnerHere = !!ball && live && runnerOf(ball.o) === myId;
    if (runnerHere && ball) {
      if (!r.running || ball.t !== r.lastT) {
        // Taking the ball: from the snapshot, caught up to now.
        r.running = true;
        r.owner = ball.o;
        r.k = ball.k;
        r.lastT = ball.t;
        board.balls = [fromNet(ball, board)];
        if (!ball.st) {
          advance(board, (now - ball.t) / 1000);
          handleEvents(board.takeEvents(), true);
        }
      }
      board.step(dt, inputs);
      const ev = board.takeEvents();
      handleEvents(ev, true);

      if (ev.lost.length) {
        const lost = ev.lost[0];
        const conceder = duel ? (lost.side === 1 ? roster[0] : roster[1]) : r.owner;
        if (duel) scoreGoal(roomId, g, lost.side === 1 ? roster[1] : roster[0], r.k).catch(console.error);
        else loseLife(roomId, g, r.k).catch(console.error);
        board.balls = [];
        board.serve(conceder, SERVE_DELAY);
        r.k++;
        r.owner = conceder;
        writeBall(board.balls[0]);
      } else if (board.balls[0]) {
        const b = board.balls[0];
        const next = ownerFor(b, r.owner);
        const bounced = ev.paddle || ev.wall || ev.broke.length || ev.served;
        if (next !== r.owner) {
          r.owner = next;
          writeBall(b);
        } else if (bounced || performance.now() - r.lastSend > BALL_SEND_MS) {
          writeBall(b);
        }
      }
      if (!duel && board.done) coopWon(roomId, g).catch(console.error);
      if (runnerOf(r.owner) !== myId) r.running = false;
    } else {
      r.running = false;
      board.balls = [];
      board.step(dt, inputs);
      board.takeEvents();
    }

    // My paddle (and the bots') for the rest.
    for (const p of board.paddles) {
      if (!((p.id === myId && playing) || (isBot(p.id) && host))) continue;
      const sent = padSent.current.get(p.id);
      const at = performance.now();
      if (!sent || (Math.abs(sent.x - p.x) > 0.02 && at - sent.at > PAD_SEND_MS)) {
        padSent.current.set(p.id, { x: p.x, at });
        sendPad(roomId, g, p.id, p.x);
      }
    }

    // The ball as drawn: mine as stepped, anyone else's moved on from its snapshot.
    let balls: { x: number; y: number }[] = board.balls;
    if (!runnerHere && ball) {
      if (ball.st) {
        const p = board.paddle(ball.o);
        balls = p ? [{ x: p.x + (ball.off ?? 0), y: p.side === 1 ? BOTTOM_Y - BALL_R : 2 + BALL_R }] : [];
      } else {
        const gb = (ghost.current ??= new Board("", [], { goal: "ninguno", lives: 99, openTop: duel, powerups: false, selfServe: false }));
        gb.cells = board.cells.slice();
        gb.paddles = board.paddles.map((p) => ({ ...p }));
        gb.balls = [fromNet(ball, gb)];
        advance(gb, (now - ball.t) / 1000);
        gb.takeEvents();
        balls = gb.balls;
      }
    }
    stepParticles(particles.current, dt);

    if (performance.now() - lastHud.current > 300) {
      lastHud.current = performance.now();
      setProgress(board.progress());
    }

    return {
      view: {
        cells: board.cellString(),
        paddles: board.paddles.map((p) => ({ x: p.x, hw: p.hw, side: p.side, color: playerInfo(s, p.id).color, me: p.id === myId })),
        balls,
        flip,
        lanes: duel ? undefined : board.paddles.slice(1).map((p) => p.min),
      },
      particles: particles.current,
    };
  };

  // Duel: a rival gone for good loses.
  useEffect(() => {
    if (!duel || !playing || state.status !== "playing") return;
    const id = setInterval(() => {
      const { presence: pres, presenceLoaded: loaded } = presenceRef.current;
      const rival = roster.find((p) => p !== myId);
      if (!loaded || !rival || isBot(rival)) return;
      if (rival in pres) {
        absentSince.current = 0;
        return;
      }
      absentSince.current ||= Date.now();
      if (Date.now() - absentSince.current > FORFEIT_MS) forfeit(roomId, g, myId).catch(console.error);
    }, 1000);
    return () => clearInterval(id);
  }, [duel, playing, state.status, roster, myId, roomId, g]);

  const now = useServerNow(true, 250);
  const countdown = now && now < state.startedAt ? Math.ceil((state.startedAt - now) / 1000) : 0;
  useCountdownBeeps(countdown);

  // Goals and lost lives, heard by everyone.
  const goalsKey = roster.map((id) => state.goals[id] ?? 0).join(",");
  const prevGoals = useRef(goalsKey);
  useEffect(() => {
    if (prevGoals.current === goalsKey) return;
    const before = prevGoals.current.split(",").map(Number);
    prevGoals.current = goalsKey;
    const after = goalsKey.split(",").map(Number);
    const scorer = roster.find((_, i) => after[i] > (before[i] ?? 0));
    if (scorer) ladriAudio.goal(scorer === myId);
  }, [goalsKey, roster, myId]);
  const prevLives = useRef(state.lives);
  useEffect(() => {
    if (state.lives < prevLives.current) ladriAudio.lost();
    prevLives.current = state.lives;
  }, [state.lives]);

  const [bottom, top] = flip ? [roster[1], roster[0]] : [roster[0], roster[1]];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {duel ? (
        <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-4 px-3 pt-2 text-white">
          <ScoreSide state={state} id={top} myId={myId} />
          <span className="text-xs text-white/50">a {state.target}</span>
          <ScoreSide state={state} id={bottom} myId={myId} />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-xl px-3 pt-2 text-white">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">En equipo · {level.name}</p>
              <GoalPill goal={level.goal} />
            </div>
            <Lives lives={state.lives} />
          </div>
          <div className="flex items-center gap-2 py-1.5 text-xs text-white/60">
            <span className="w-9 font-mono">{Math.round(progress * 100)}%</span>
            <ProgressBar value={progress} />
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col px-2 pb-3 pt-1">
        <Field frame={frame} input={input} flip={flip} controls={playing} paddleX={() => getBoard().paddle(myId)?.x ?? COLS / 2}>
          <Countdown seconds={countdown} />
          {!playing && (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/60">Estás mirando</p>
          )}
        </Field>
      </div>
    </div>
  );
}

function ScoreSide({ state, id, myId }: { state: LadriState; id: string | undefined; myId: string }) {
  if (!id) return null;
  const info = playerInfo(state, id);
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: info.color }} />
      <span className="max-w-[90px] truncate text-sm font-bold">{id === myId ? "Vos" : info.name}</span>
      <span className="font-display text-2xl">{state.goals[id] ?? 0}</span>
    </div>
  );
}
