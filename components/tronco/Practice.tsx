"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ActionButtons, TimingMeter, paintButtons, paintMeter } from "./Hud";
import {
  FALL_TEXT,
  JUMP_LEN,
  KICK_MISS_RECOVER,
  KICK_RECOVER,
  PRACTICED_KEY,
  airborne,
  crossings,
  cueAt,
  fallReason,
  kickWorks,
  logAt,
  seatAngle,
  speedAt,
  type FallReason,
  type Timeline,
} from "@/lib/tronco";
import { TroncoScene, type PlayerView } from "@/lib/tronco3d";
import { playSound } from "@/lib/sfx";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { useWakeLock } from "@/components/carreras/Controller";
import { PRIMARY_BUTTON } from "@/components/ui";

/**
 * El tronco's practice: no room, no network. You and three bots that always
 * jump; the log goes slowly and the steps teach one thing at a time —
 * jumping, kicking, then both with the log speeding up. Falling doesn't put
 * you out: it tells you why, and you get up.
 */



const SEATS = 4;
const ME = 0;
const BOTS = [
  { id: "p1", name: "Mati", color: "#22c55e" },
  { id: "p2", name: "Sofi", color: "#3b82f6" },
  { id: "p3", name: "Nico", color: "#f97316" },
];
/** How long a fall in practice lasts before getting up. */
const GET_UP_MS = 1300;

interface Step {
  title: string;
  text: string;
  goal: number;
  pace: number;
  jump: boolean;
  kick: boolean;
}

const STEPS: Step[] = [
  {
    title: "Saltá",
    text: "Mirá la barra de abajo: cuando el tronco entra en lo amarillo, el botón «Saltar» se ilumina. ¡Ahí apretalo!",
    goal: 3,
    pace: 0.8,
    jump: true,
    kick: false,
  },
  {
    title: "Pateá",
    text: "Ahora esperá que llegue a lo verde (más cerca) y apretá «Patear»: el tronco se da vuelta y vuelve para el otro lado.",
    goal: 3,
    pace: 0.8,
    jump: false,
    kick: true,
  },
  {
    title: "Las dos, cada vez más rápido",
    text: "Saltá o pateá, como quieras. El tronco acelera: aguantá 6 pasadas seguidas.",
    goal: 6,
    pace: 1.05,
    jump: true,
    kick: true,
  },
];

export default function TroncoPractice({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const identity = useClientIdentity();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpBtn = useRef<HTMLButtonElement>(null);
  const kickBtn = useRef<HTMLButtonElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const [flash, setFlash] = useState<{ text: string; key: number; bad?: boolean } | null>(null);
  const [reason, setReason] = useState<FallReason | null>(null);
  useWakeLock();

  const sim = useRef({
    // Starts rolling a moment after it opens (set on mount).
    tl: { startedAt: Infinity, angle0: seatAngle(2, SEATS), dir0: 1, kicks: [], pace: STEPS[0].pace } as Timeline,
    me: { jump: -1e12, kick: -1e12, busy: 0, judged: 0, fell: -1 },
    bots: BOTS.map(() => ({ jump: -1e12, busy: 0, judged: 0, lead: 0.2 })),
    step: 0,
    count: 0,
    color: "#FFD400",
  });
  useEffect(() => {
    if (identity.color) sim.current.color = identity.color;
  }, [identity.color]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.bad ? 1800 : 900);
    return () => clearTimeout(t);
  }, [flash]);

  /** Starts a step's log again from where it is now, slow (the speed resets). */
  const rebase = (pace: number) => {
    const s = sim.current;
    const now = Date.now();
    const { angle, dir } = logAt(s.tl, now);
    s.tl = { startedAt: Math.max(now, s.tl.startedAt), angle0: angle, dir0: dir, kicks: [], pace };
    s.me.judged = now;
    s.bots.forEach((b) => (b.judged = now));
  };

  const progress = (n: number) => {
    const s = sim.current;
    s.count = n;
    setCount(n);
    if (n < STEPS[s.step].goal) return;
    const next = s.step + 1;
    if (next >= STEPS.length) {
      setDone(true);
      playSound("win");
      try {
        localStorage.setItem(PRACTICED_KEY, "1");
      } catch {
        // Private mode: it'll just suggest practicing again.
      }
      return;
    }
    playSound("good");
    s.step = next;
    s.count = 0;
    setStep(next);
    setCount(0);
    rebase(STEPS[next].pace);
  };

  const myTheta = seatAngle(ME, SEATS);
  const up = () => sim.current.me.fell < 0;

  const jumpMe = () => {
    const s = sim.current;
    const now = Date.now();
    if (!STEPS[s.step].jump || now < s.me.busy || !up() || now < s.tl.startedAt) return;
    s.me.jump = now;
    s.me.busy = now + JUMP_LEN * 1000;
    playSound("flip");
  };
  const kickMe = () => {
    const s = sim.current;
    const now = Date.now();
    if (!STEPS[s.step].kick || now < s.me.busy || !up() || now < s.tl.startedAt) return;
    const works = kickWorks(s.tl, now, myTheta);
    s.me.kick = now;
    s.me.busy = now + (works ? KICK_RECOVER : KICK_MISS_RECOVER) * 1000;
    if (!works) {
      playSound("tick");
      setFlash({ text: "¡Al aire! Esperá lo verde", key: now, bad: true });
      return;
    }
    s.tl = { ...s.tl, kicks: [...s.tl.kicks, now] };
    playSound("capture");
    setFlash({ text: "¡PUM!", key: now });
    if (s.step >= 1) progress(s.count + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ([" ", "ArrowUp", "w", "W"].includes(e.key)) {
        e.preventDefault();
        jumpMe();
      } else if (["k", "K", "ArrowDown", "s", "S", "Enter"].includes(e.key)) {
        e.preventDefault();
        kickMe();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    sim.current.tl.startedAt = Date.now() + 1800;
    let scene: TroncoScene;
    try {
      scene = new TroncoScene(canvas);
    } catch (err) {
      console.error(err);
      return;
    }
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      scene.resize(r.width, r.height);
    });
    ro.observe(wrap);
    let raf = 0;
    const loop = () => {
      const s = sim.current;
      const now = Date.now();
      const rolling = now >= s.tl.startedAt;

      if (rolling) {
        // Bots: always jump, a little early.
        BOTS.forEach((_, i) => {
          const b = s.bots[i];
          const theta = seatAngle(i + 1, SEATS);
          if (now >= b.busy && cueAt(s.tl, now, theta).ttc <= b.lead) {
            b.jump = now;
            b.busy = now + JUMP_LEN * 1000;
            b.lead = 0.14 + Math.random() * 0.14;
          }
        });
        // Me: judged a bit late, like in the match.
        const upto = now - 120;
        const from = Math.max(s.me.judged, s.tl.startedAt);
        if (upto > from && up()) {
          for (const c of crossings(s.tl, myTheta, from, upto)) {
            if (airborne(s.me.jump, c)) {
              playSound("whoosh");
              setFlash({ text: "¡Bien!", key: now });
              if (s.step === 0 || s.step === 2) progress(s.count + 1);
              continue;
            }
            s.me.fell = now;
            const why = fallReason(s.me.jump, s.me.kick, c);
            setReason(why);
            setFlash({ text: "¡Uy!", key: now, bad: true });
            playSound("bad");
            // The last step counts passes in a row.
            if (s.step === 2 && s.count) progress(0);
            break;
          }
          s.me.judged = upto;
        }
        if (s.me.fell >= 0 && now - s.me.fell > GET_UP_MS) {
          s.me.fell = -1;
          s.me.judged = now;
          setReason(null);
        }
      }

      const log = logAt(s.tl, now);
      const speed = rolling ? speedAt(s.tl, now) : 0;
      const players: PlayerView[] = [
        {
          id: "me",
          name: "Vos",
          color: s.color,
          angle: myTheta,
          me: true,
          jumpS: (now - s.me.jump) / 1000,
          kickS: (now - s.me.kick) / 1000,
          fallS: s.me.fell >= 0 ? (now - s.me.fell) / 1000 : -1,
        },
        ...BOTS.map((b, i) => ({
          id: b.id,
          name: b.name,
          color: b.color,
          angle: seatAngle(i + 1, SEATS),
          me: false,
          jumpS: (now - s.bots[i].jump) / 1000,
          kickS: 99,
          fallS: -1,
        })),
      ];
      const st = STEPS[s.step];
      const raw = up() ? cueAt(s.tl, now, myTheta) : { ttc: Infinity, jump: false, kick: false };
      // Only the step's buttons light up.
      const cue = { ...raw, jump: raw.jump && st.jump, kick: raw.kick && st.kick };
      const busy = now < s.me.busy;
      paintButtons(jumpBtn.current, kickBtn.current, cue, busy);
      paintMeter(meterRef.current, cue, log.dir, up() && rolling, busy, { jump: st.jump, kick: st.kick });
      scene.frame({
        logAngle: log.angle,
        logDir: log.dir,
        speed,
        shake: false,
        rolling,
        cue,
        players,
        myAngle: myTheta,
        time: performance.now() / 1000,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one scene; everything else is read from refs.
  }, []);

  const again = () => {
    const s = sim.current;
    s.step = 2;
    s.count = 0;
    setStep(2);
    setCount(0);
    setDone(false);
    rebase(STEPS[2].pace);
  };

  const st = STEPS[step];
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-talo-ink">
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="font-display text-lg text-white">Práctica</p>
        <div className="flex flex-1 items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step || done ? "bg-emerald-400" : i === step ? "bg-talo-hero" : "bg-white/15"}`} />
          ))}
        </div>
        <button onClick={onClose} aria-label="Cerrar la práctica" className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none select-none" />
        {!done && (
          <div className="pointer-events-none absolute inset-x-3 top-2 mx-auto max-w-md rounded-2xl bg-black/70 px-4 py-3 text-white">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-display text-lg">
                {step + 1}. {st.title}
              </p>
              <p className="font-mono text-sm font-bold text-talo-hero">
                {count}/{st.goal}
              </p>
            </div>
            <p className="mt-1 text-sm leading-snug text-white/85">{st.text}</p>
          </div>
        )}
        {flash && (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center gap-2 px-4">
            <span key={flash.key} className={`animate-celebration-in font-display text-5xl drop-shadow ${flash.bad ? "text-white" : "text-talo-hero"}`}>
              {flash.text}
            </span>
            {flash.bad && reason && (
              <span className="max-w-xs rounded-2xl bg-black/70 px-3 py-1.5 text-center text-sm font-bold text-talo-hero">{FALL_TEXT[reason]}</span>
            )}
          </div>
        )}
        {!done && (
          <div className="absolute inset-x-4 bottom-3">
            <TimingMeter meterRef={meterRef} />
          </div>
        )}
        {done && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4">
            <div className="flex w-full max-w-sm flex-col gap-3 rounded-[20px] bg-[#1c1c1c] p-5 text-center">
              <p className="font-display text-3xl text-white">¡Ya sabés jugar!</p>
              <p className="text-sm text-white/70">En la ronda de verdad, si el tronco te toca con los pies en el piso quedás afuera. Gana el último que queda parado.</p>
              <button onClick={onPlay} className={PRIMARY_BUTTON}>
                Jugar contra bots
              </button>
              <button onClick={again} className="rounded-xl py-2 text-sm font-bold text-white/70 hover:bg-white/10 hover:text-white">
                Seguir practicando
              </button>
            </div>
          </div>
        )}
      </div>
      {!done && <ActionButtons jumpRef={jumpBtn} kickRef={kickBtn} onJump={jumpMe} onKick={kickMe} jumpOff={!st.jump} kickOff={!st.kick} />}
    </div>
  );
}
