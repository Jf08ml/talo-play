"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AdjustButton, PadSurface, usePadSettings } from "@/components/PadKit";
import { padDefaults, type PadControl } from "@/lib/padLayout";
import { Keyboard, MonitorPlay, Shield, Sparkles, Swords } from "lucide-react";
import { MODE_INFO, NO_PAD, fighterColor, fighterName, openPad, teamInfo, wavesSurvived, type ArenaPad, type ArenaState } from "@/lib/arena";
import { MAX_HP, SPECIALS, SPECIAL_MAX, WEAPONS, specialOf } from "@/lib/arenaSim";
import { useWakeLock } from "@/components/carreras/Controller";
import { EMOTES } from "@/lib/arenaLooks";
import { TOUCH_LOOK } from "./Controls";

/**
 * The phone as Arena medieval's controller when the fight is on a big screen,
 * played like on the phone itself: a stick on the left (it appears where the
 * thumb lands; up = forward), and on the right a zone to drag and look
 * around — the knight faces and strikes where its camera looks — with the
 * buttons on it: «Atacar» and «Bloquear» (held), «Esquivar», «Saltar»,
 * «Patada», «Especial» (lit when the meter is full) and «Agarrar» (presses,
 * counted so none is lost). Shows my health, special meter and gear and
 * vibrates when I'm hit. On a computer: WASD move, the arrows look, J
 * attacks, K blocks, L dodges, I kicks, O the special, space jumps, E picks up.
 * «Ajustar» moves and resizes every button and sets the look's sensitivity
 * (`arena.controles`).
 */

/** ~30 a second: the look feels direct on the TV without flooding the database. */
const SEND_MS = 33;
const DEAD = 0.12;

type PadId = "stick" | "atacar" | "bloquear" | "patada" | "especial" | "agarrar" | "saltar" | "esquivar" | "gestos";
const CONTROLS: Record<PadId, PadControl> = {
  stick: { label: "Joystick", size: 128 },
  atacar: { label: "Atacar", size: 104 },
  bloquear: { label: "Bloquear", size: 60, wide: 1.6 },
  patada: { label: "Patada", size: 48, wide: 1.9 },
  especial: { label: "Especial", size: 48, wide: 1.7 },
  agarrar: { label: "Agarrar", size: 46, wide: 1.7 },
  saltar: { label: "Saltar", size: 46, wide: 1.7 },
  esquivar: { label: "Esquivar", size: 46, wide: 1.7 },
  gestos: { label: "Gestos", size: 40, wide: 4.6 },
};
const DEFAULTS = padDefaults<PadId>({
  stick: { x: 0.22, y: 0.6, s: 1 },
  atacar: { x: 0.84, y: 0.8, s: 1 },
  bloquear: { x: 0.84, y: 0.54, s: 1 },
  patada: { x: 0.84, y: 0.35, s: 1 },
  especial: { x: 0.58, y: 0.36, s: 1 },
  agarrar: { x: 0.58, y: 0.53, s: 1 },
  saltar: { x: 0.58, y: 0.7, s: 1 },
  esquivar: { x: 0.58, y: 0.87, s: 1 },
  gestos: { x: 0.74, y: 0.1, s: 1 },
});
/** Arrow keys turn the look this fast (rad/s). */
const KEY_LOOK = 2.4;

const MOVE_KEYS: Record<string, [number, number]> = {
  w: [0, 1],
  s: [0, -1],
  a: [-1, 0],
  d: [1, 0],
};

/** Keeps the finger's events on this element (it can fail on synthetic or already-ended pointers). */
function capture(e: ReactPointerEvent<HTMLElement>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
}

/** Presses and look per room and player, kept while the page lives (the screen only uses what changed). */
const counts = new Map<string, Pick<ArenaPad, "j" | "d" | "p" | "k" | "s" | "e" | "lx" | "ly">>();

export default function Pad({ roomId, clientId, state }: { roomId: string; clientId: string; state: ArenaState }) {
  useWakeLock();
  const key = `${roomId}/${clientId}`;
  const wire = useRef<ArenaPad>({ ...NO_PAD, ...counts.get(key) });
  const padRef = useRef<ReturnType<typeof openPad> | null>(null);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [held, setHeld] = useState({ a: false, b: false });
  const [settings, setSettings] = usePadSettings("arena.controles", DEFAULTS);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const p = openPad(roomId, clientId);
    padRef.current = p;
    p.send(wire.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      p.close();
      padRef.current = null;
    };
  }, [roomId, clientId]);

  /** Changes the pad and sends it now if it's been long enough, else when the gap is over (always the latest). */
  const send = (patch: Partial<ArenaPad>, urgent = false) => {
    wire.current = { ...wire.current, ...patch };
    const w = wire.current;
    counts.set(key, { j: w.j, d: w.d, p: w.p, k: w.k, s: w.s, e: w.e, lx: w.lx, ly: w.ly });
    const go = () => {
      timer.current = null;
      lastAt.current = performance.now();
      padRef.current?.send({ ...wire.current });
    };
    if (urgent || performance.now() - lastAt.current >= SEND_MS) {
      if (timer.current) clearTimeout(timer.current);
      go();
    } else if (!timer.current) timer.current = setTimeout(go, SEND_MS - (performance.now() - lastAt.current));
  };
  const setMove = (x: number, y: number) => {
    const len = Math.hypot(x, y);
    const k = len < DEAD ? 0 : Math.min(1, len) / len;
    send({ x: Math.round(x * k * 100) / 100, y: Math.round(y * k * 100) / 100 });
  };
  const turn = (dx: number, dy: number) => {
    const w = wire.current;
    send({ lx: Math.round((w.lx + dx) * 10000) / 10000, ly: Math.round((w.ly + dy) * 10000) / 10000 });
  };
  const hold = (b: "a" | "b", on: boolean) => {
    if (!!wire.current[b] === on) return;
    send({ [b]: on ? 1 : 0 }, true);
    setHeld((h) => ({ ...h, [b]: on }));
    if (on) navigator.vibrate?.(10);
  };
  const press = (c: "j" | "d" | "p" | "k" | "s") => {
    send({ [c]: (wire.current[c] ?? 0) + 1 }, true);
    navigator.vibrate?.(12);
  };
  /** A gesture (1–4), counted like the presses. */
  const gesture = (n: number) => {
    send({ e: (wire.current.e ?? 0) + 1, ek: n }, true);
    navigator.vibrate?.(12);
  };

  // Hit: vibrate (harder when it wasn't blocked).
  const hit = state.hits[clientId];
  const hitN = hit?.n ?? 0;
  const lastHit = useRef(hitN);
  useEffect(() => {
    if (hitN > lastHit.current && hit) navigator.vibrate?.(hit.b ? 40 : [90, 40, 60]);
    lastHit.current = hitN;
  }, [hitN, hit]);

  // Keyboard (computers): WASD move, arrows look.
  useEffect(() => {
    const down = new Set<string>();
    let frame = 0;
    let last = performance.now();
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const lx = (down.has("arrowright") ? 1 : 0) - (down.has("arrowleft") ? 1 : 0);
      const ly = (down.has("arrowdown") ? 1 : 0) - (down.has("arrowup") ? 1 : 0);
      if (lx || ly) turn(lx * KEY_LOOK * dt, ly * KEY_LOOK * 0.6 * dt);
    };
    frame = requestAnimationFrame(loop);
    const apply = () => {
      let x = 0;
      let y = 0;
      for (const k of down) {
        const m = MOVE_KEYS[k];
        if (m) {
          x += m[0];
          y += m[1];
        }
      }
      const n = Math.hypot(x, y) || 1;
      setMove(x / n, y / n);
      hold("a", down.has("j"));
      hold("b", down.has("k"));
    };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.target instanceof HTMLInputElement) return;
      if (!e.repeat && k === " ") press("j");
      else if (!e.repeat && k === "l") press("d");
      else if (!e.repeat && k === "e") press("p");
      else if (!e.repeat && k === "i") press("k");
      else if (!e.repeat && k === "o") press("s");
      else if (!e.repeat && k.length === 1 && k >= "1" && k <= String(EMOTES.length)) gesture(Number(k));
      else if (!(k in MOVE_KEYS) && k !== "j" && k !== "k" && !k.startsWith("arrow")) return;
      e.preventDefault();
      down.add(k);
      apply();
    };
    const onUp = (e: KeyboardEvent) => {
      if (down.delete(e.key.toLowerCase())) apply();
    };
    const clear = () => {
      down.clear();
      apply();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
    };
    // The handlers only touch refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const team = state.roster[clientId];
  const color = team ? fighterColor(state, clientId) : "#94a3b8";
  const label = !team ? "Mirando" : state.mode === "equipos" || state.mode === "rey" ? teamInfo(team).label : MODE_INFO[state.mode].label;
  const over =
    state.mode === "todos"
      ? state.champion
        ? state.champion === clientId
          ? "¡Ganaste!"
          : `¡Ganó ${fighterName(state, state.champion)}!`
        : "Terminó el combate"
      : state.mode === "supervivencia"
        ? `Aguantaron ${wavesSurvived(state)} ${wavesSurvived(state) === 1 ? "oleada" : "oleadas"}`
        : state.winner
          ? `¡Ganó el ${teamInfo(state.winner).label}!`
          : "Terminó el combate";
  const hp = state.hp[clientId] ?? 0;
  const gear = state.gear[clientId];
  const fighting = state.status === "fighting";
  const down = !!team && fighting && hp <= 0;
  const holdBtn = (b: "a" | "b") => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      capture(e);
      hold(b, true);
    },
    onPointerUp: () => hold(b, false),
    onPointerCancel: () => hold(b, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const special = state.special[clientId] ?? 0;
  const full = special >= SPECIAL_MAX;
  const tap = (c: "j" | "d" | "p" | "k" | "s") => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      press(c);
    },
  });

  const plain = "flex h-full w-full items-center justify-center rounded-2xl text-sm font-bold";
  const face = (id: PadId) => {
    switch (id) {
      case "atacar":
        return (
          <span
            className={`flex h-full w-full items-center justify-center rounded-full border-[3px] border-talo-ink font-display text-xl text-talo-ink transition-transform ${held.a ? "scale-95 brightness-110" : ""}`}
            style={{ background: color }}
          >
            Atacar
          </span>
        );
      case "bloquear":
        return (
          <span className={`${plain} gap-1.5 ${held.b ? "bg-white text-talo-ink" : "bg-white/[0.14] text-white"}`}>
            <Shield className="h-4 w-4" /> Bloquear
          </span>
        );
      case "especial":
        return (
          <span className={`${plain} flex-col text-[11px] leading-tight ${full ? "animate-pulse bg-white text-talo-ink" : "bg-white/[0.06] text-white/35"}`}>
            <Sparkles className="h-4 w-4" />
            {gear ? SPECIALS[specialOf(gear.w)].label : "Especial"}
          </span>
        );
      case "agarrar":
        return <span className={`${plain} bg-talo-hero/90 text-talo-ink`}>Agarrar</span>;
      case "gestos":
        return (
          <span className="flex h-full w-full items-center justify-between gap-1">
            {EMOTES.map((em) => (
              <span key={em.id} className="flex h-full flex-1 items-center justify-center rounded-xl bg-white/[0.08] text-lg">
                {em.emoji}
              </span>
            ))}
          </span>
        );
      default:
        return <span className={`${plain} bg-white/[0.14] text-white`}>{CONTROLS[id].label}</span>;
    }
  };

  return (
    <div className="flex h-dvh flex-col gap-3 bg-talo-ink p-3 text-white select-none [touch-action:none]">
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-2.5">
        <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>{label}</span>
            <span className="flex items-center gap-1.5 text-white/70">
              {gear && WEAPONS[gear.w].label}
              {gear?.sh && <Shield className="h-3.5 w-3.5 text-sky-300" />}
            </span>
          </div>
          {team && (
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${(hp / MAX_HP) * 100}%`, background: color }} />
            </div>
          )}
          {team && (
            <div className="mt-1 flex items-center gap-1.5">
              <Sparkles className={`h-3 w-3 shrink-0 ${full ? "text-talo-hero" : "text-white/40"}`} />
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full transition-all ${full ? "bg-talo-hero" : "bg-white/50"}`} style={{ width: `${(Math.min(SPECIAL_MAX, special) / SPECIAL_MAX) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
        <MonitorPlay className="h-5 w-5 shrink-0 text-white/40" aria-label="Mira la pantalla grande" />
      </div>

      {state.status === "finished" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Swords className="h-10 w-10 text-talo-hero" />
          <p className="font-display text-2xl">{over}</p>
          <p className="text-sm text-white/60">La revancha se arma desde la pantalla grande.</p>
        </div>
      ) : down ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Swords className="h-10 w-10 text-white/40" />
          <p className="font-display text-2xl">{state.mode === "rey" ? "Vuelves en un momento" : "Te eliminaron"}</p>
          <p className="text-sm text-white/60">
            {state.mode === "rey"
              ? "Mira la pantalla: en unos segundos estás de nuevo en pie."
              : state.mode === "supervivencia"
                ? "Mira la pantalla: si tus compañeros superan la oleada, vuelves a pelear."
                : "Mira la pantalla: en la próxima ronda vuelves a pelear."}
          </p>
        </div>
      ) : !team ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-white/60">Estás mirando este combate en la pantalla grande. Entras en el próximo.</div>
      ) : (
        <PadSurface
          controls={CONTROLS}
          settings={settings}
          stick={{ id: "stick", color, onMove: (x, y) => setMove(x, -y), hint: "Moverte (a fondo: correr)" }}
          onLook={(dx, dy) => turn(dx * TOUCH_LOOK, dy * TOUCH_LOOK)}
          edit={{
            open: editing,
            onClose: () => setEditing(false),
            onChange: setSettings,
            defaults: DEFAULTS,
            face: (id) => face(id),
            sens: { label: "Sensibilidad al mirar", min: 0.4, max: 2.5 },
          }}
          className="min-h-0 flex-1 rounded-[24px] bg-white/[0.04] ring-1 ring-white/[0.08]"
        >
          {(place) => (
            <>
              <span className="pointer-events-none absolute left-[46%] top-3 text-xs font-bold text-white/30">Arrastra aquí para mirar</span>
              {/* Gestures, seen on the TV over your knight. */}
              <div className="flex items-center justify-between gap-1" style={place("gestos")}>
                {EMOTES.map((em, i) => (
                  <button
                    key={em.id}
                    type="button"
                    aria-label={em.label}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      gesture(i + 1);
                    }}
                    className="flex h-full flex-1 items-center justify-center rounded-xl bg-white/[0.08] text-lg active:bg-white/25"
                  >
                    {em.emoji}
                  </button>
                ))}
              </div>
              <button type="button" {...tap("s")} aria-label="Golpe especial" style={place("especial")}>
                {face("especial")}
              </button>
              <button type="button" {...tap("p")} style={place("agarrar")}>
                {face("agarrar")}
              </button>
              <button type="button" {...tap("j")} style={place("saltar")}>
                {face("saltar")}
              </button>
              <button type="button" {...tap("d")} style={place("esquivar")}>
                {face("esquivar")}
              </button>
              <button type="button" {...tap("k")} style={place("patada")}>
                {face("patada")}
              </button>
              <button type="button" {...holdBtn("b")} style={place("bloquear")}>
                {face("bloquear")}
              </button>
              <button type="button" {...holdBtn("a")} style={place("atacar")}>
                {face("atacar")}
              </button>
              <AdjustButton onClick={() => setEditing(true)} className="absolute left-2 top-2" />
            </>
          )}
        </PadSurface>
      )}

      <p className="pointer-events-none hidden items-center justify-center gap-1.5 text-xs text-white/40 [@media(hover:hover)_and_(pointer:fine)]:flex">
        <Keyboard className="h-3.5 w-3.5" /> WASD moverte · flechas mirar · J atacar · K bloquear · L esquivar · I patada · O especial · espacio saltar · E agarrar · 1–4 gestos
      </p>
    </div>
  );
}
