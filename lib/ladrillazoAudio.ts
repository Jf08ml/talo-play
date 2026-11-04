import { isMuted } from "./sfx";
import type { Events } from "./ladrillazoSim";

/**
 * Ladrillazo's sounds, all synthesized with Web Audio (no files): bricks
 * that climb a pentatonic scale with the combo, the paddle's "boing" pitched
 * by where the ball hit it, clinks, bells, bombs, power-ups, attacks and
 * the countdown. Shares the site's mute (`talo.sonido`, lib/sfx.ts).
 *
 * The context starts on the first tap or key (`installLadriAudio`), since
 * the solo game has no room header to do it.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let installed = false;

function unlock() {
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }
    // A compressor so a bomb taking out twenty bricks doesn't clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

/** Arms the audio on the page's first tap/key (idempotent). */
export function installLadriAudio() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

function now(): number | null {
  if (!ctx || !master || ctx.state !== "running" || isMuted()) return null;
  return ctx.currentTime + 0.005;
}

function tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number, slideTo?: number, attack = 0.005) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, freqTo?: number, q = 1) {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** Semitones above C5. */
const N = (s: number) => 523.25 * Math.pow(2, s / 12);
/** C major pentatonic, two octaves and a bit: the combo climbs it. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

const last: Record<string, number> = {};
/** At most one of a kind every `gap` seconds (a frame can break many bricks). */
function gate(kind: string, t: number, gap: number): boolean {
  if (t - (last[kind] ?? -1) < gap) return false;
  last[kind] = t;
  return true;
}

export const ladriAudio = {
  paddle(off: number) {
    const t = now();
    if (t === null || !gate("paddle", t, 0.05)) return;
    const f = 260 * Math.pow(2, off * 0.35);
    tone(f, t, 0.13, "sine", 0.4, f * 1.6);
    tone(f * 2, t, 0.05, "triangle", 0.12);
  },
  wall() {
    const t = now();
    if (t === null || !gate("wall", t, 0.06)) return;
    tone(1400, t, 0.03, "sine", 0.06);
  },
  thud() {
    const t = now();
    if (t === null || !gate("thud", t, 0.06)) return;
    tone(150, t, 0.09, "sine", 0.3, 90);
    noise(t, 0.05, 0.12, "lowpass", 600);
  },
  /** A brick broken: higher with each one in the combo. */
  brick(combo: number) {
    const t = now();
    if (t === null || !gate("brick", t, 0.035)) return;
    const s = SCALE[Math.min(SCALE.length - 1, Math.max(0, combo - 1))];
    tone(N(s), t, 0.14, "triangle", 0.26);
    tone(N(s + 12), t, 0.06, "sine", 0.08);
    noise(t, 0.025, 0.12, "highpass", 3000);
  },
  hard() {
    const t = now();
    if (t === null || !gate("hard", t, 0.04)) return;
    tone(1250, t, 0.12, "square", 0.06);
    tone(1870, t, 0.18, "sine", 0.12);
  },
  target() {
    const t = now();
    if (t === null || !gate("target", t, 0.08)) return;
    tone(N(12), t, 0.5, "sine", 0.3);
    tone(N(19), t + 0.04, 0.6, "sine", 0.2);
    tone(N(24), t + 0.08, 0.5, "triangle", 0.1);
  },
  bomb() {
    const t = now();
    if (t === null || !gate("bomb", t, 0.1)) return;
    noise(t, 0.45, 0.7, "lowpass", 1800, 120);
    tone(140, t, 0.4, "sine", 0.5, 35);
  },
  power(kind: string) {
    const t = now();
    if (t === null) return;
    const steps = kind === "v" ? [0, 4, 7, 12, 16] : kind === "m" ? [0, 7, 12, 19] : [0, 5, 9, 12];
    steps.forEach((s, i) => tone(N(s), t + i * 0.055, 0.14, "square", 0.07));
  },
  launch() {
    const t = now();
    if (t === null || !gate("launch", t, 0.1)) return;
    tone(500, t, 0.12, "sine", 0.22, 1000);
  },
  lost() {
    const t = now();
    if (t === null || !gate("lost", t, 0.3)) return;
    tone(440, t, 0.55, "sawtooth", 0.09, 70);
    tone(220, t + 0.05, 0.5, "sine", 0.2, 55);
  },
  /** A row of bricks comes down (the attack's wall). */
  rowDrop() {
    const t = now();
    if (t === null) return;
    tone(90, t, 0.2, "sine", 0.35, 60);
    noise(t, 0.15, 0.15, "lowpass", 400);
  },
  attackSent() {
    const t = now();
    if (t === null) return;
    noise(t, 0.35, 0.35, "bandpass", 400, 4000, 3);
    tone(N(7), t + 0.15, 0.15, "square", 0.06);
    tone(N(12), t + 0.22, 0.2, "square", 0.06);
  },
  attackHit() {
    const t = now();
    if (t === null) return;
    noise(t, 0.6, 0.5, "lowpass", 300, 80);
    tone(70, t, 0.5, "sawtooth", 0.12, 45);
  },
  /** The attack's bricks getting close to the line: a heartbeat. */
  danger() {
    const t = now();
    if (t === null) return;
    tone(70, t, 0.12, "sine", 0.4);
    tone(65, t + 0.18, 0.14, "sine", 0.3);
  },
  /** 3, 2, 1 (n > 0) and go (0). */
  countdown(n: number) {
    const t = now();
    if (t === null) return;
    if (n > 0) tone(N(0), t, 0.15, "square", 0.08);
    else tone(N(12), t, 0.35, "square", 0.1);
  },
  goal(mine: boolean) {
    const t = now();
    if (t === null) return;
    if (mine) [0, 4, 7, 12].forEach((s, i) => tone(N(s), t + i * 0.07, 0.2, "triangle", 0.2));
    else {
      tone(N(-5), t, 0.25, "sawtooth", 0.07, N(-12));
    }
  },
  win() {
    const t = now();
    if (t === null) return;
    [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(N(s), t + i * 0.09, 0.22, "triangle", 0.2));
    tone(N(19), t + 0.63, 0.7, "sine", 0.18);
    tone(N(24), t + 0.63, 0.7, "triangle", 0.08);
  },
  lose() {
    const t = now();
    if (t === null) return;
    [7, 4, 0, -5].forEach((s, i) => tone(N(s), t + i * 0.18, 0.3, "triangle", 0.15));
  },
};

/**
 * Everything a frame of my board did, as sounds. `combo` is the board's
 * combo after the frame (bricks broken since the paddle).
 */
export function playEvents(ev: Events, combo: number, ballsLeft: number) {
  if (ev.launched) ladriAudio.launch();
  if (ev.paddle) ladriAudio.paddle(ev.offs[ev.offs.length - 1] ?? 0);
  if (ev.booms.length) ladriAudio.bomb();
  if (ev.broke.some((b) => b.ch === "o")) ladriAudio.target();
  else if (ev.broke.some((b) => b.ch !== "B")) ladriAudio.brick(combo);
  if (ev.broke.some((b) => b.ch === "B")) ladriAudio.hard();
  if (ev.thud) ladriAudio.thud();
  else if (ev.wall && !ev.broke.length) ladriAudio.wall();
  for (const k of ev.power) ladriAudio.power(k);
  if (ev.lost.length && !ballsLeft) ladriAudio.lost();
}
