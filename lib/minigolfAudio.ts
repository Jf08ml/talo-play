import { AUDIO_GESTURES, isMuted, primeAudio } from "./sfx";
import type { RollEvents } from "./minigolfSim";

/**
 * Minigolf's sounds, synthesized with Web Audio: the putter's "toc" (by
 * power), wall clacks (by impact), bumpers' boing, the mill's thump, the
 * ball rattling into the cup, a splash, and the countdown. Shares the site's
 * mute (`talo.sonido`); the context starts on the first tap or key
 * (`installGolfAudio`), since solo play has no room header to do it.
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
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  primeAudio(ctx);
}

export function installGolfAudio() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  for (const ev of AUDIO_GESTURES) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

function now(): number | null {
  if (!ctx || !master || ctx.state !== "running" || isMuted()) return null;
  return ctx.currentTime + 0.005;
}

function tone(freq: number, t: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, freqTo?: number) {
  if (!ctx || !master || !noiseBuf) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const last: Record<string, number> = {};
function gate(kind: string, t: number, gap: number): boolean {
  if (t - (last[kind] ?? -1) < gap) return false;
  last[kind] = t;
  return true;
}

export const golfAudio = {
  putt(power: number) {
    const t = now();
    if (t === null) return;
    tone(900 + power * 500, t, 0.05, "triangle", 0.25 + power * 0.25, 500);
    noise(t, 0.04, 0.2 + power * 0.2, "bandpass", 2400);
  },
  wall(speed: number) {
    const t = now();
    if (t === null || speed < 0.6 || !gate("wall", t, 0.05)) return;
    const k = Math.min(1, speed / 12);
    tone(1700, t, 0.04, "square", 0.04 + k * 0.1, 1200);
    noise(t, 0.03, 0.05 + k * 0.15, "highpass", 3000);
  },
  bumper() {
    const t = now();
    if (t === null || !gate("bumper", t, 0.08)) return;
    tone(220, t, 0.22, "sine", 0.4, 520);
  },
  mill() {
    const t = now();
    if (t === null || !gate("mill", t, 0.1)) return;
    tone(140, t, 0.12, "sine", 0.4, 80);
    noise(t, 0.06, 0.2, "lowpass", 900);
  },
  lip() {
    const t = now();
    if (t === null || !gate("lip", t, 0.3)) return;
    tone(1250, t, 0.05, "triangle", 0.15);
    tone(950, t + 0.05, 0.06, "triangle", 0.12);
  },
  cup() {
    const t = now();
    if (t === null) return;
    // Rattle around the rim, then the drop.
    for (let i = 0; i < 4; i++) tone(1300 - i * 120, t + i * 0.045, 0.04, "triangle", 0.18);
    tone(180, t + 0.2, 0.18, "sine", 0.5, 90);
    tone(880, t + 0.35, 0.18, "sine", 0.18);
    tone(1320, t + 0.45, 0.25, "sine", 0.15);
  },
  splash() {
    const t = now();
    if (t === null) return;
    noise(t, 0.45, 0.4, "lowpass", 2500, 300);
    tone(300, t, 0.15, "sine", 0.2, 120);
  },
  countdown(n: number) {
    const t = now();
    if (t === null) return;
    tone(n > 0 ? 660 : 990, t, n > 0 ? 0.12 : 0.3, "sine", 0.3);
  },
  /** One physics step's events. */
  events(ev: RollEvents) {
    if (ev.wall) this.wall(ev.wall);
    if (ev.bumper) this.bumper();
    if (ev.mill) this.mill();
    if (ev.lip) this.lip();
    if (ev.cup) this.cup();
    if (ev.water) this.splash();
  },
};
