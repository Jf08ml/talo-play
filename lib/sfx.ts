/**
 * Short UI sounds for the 2D games, synthesized with Web Audio (no files):
 * a piece placed, a capture, "¡te toca!", right/wrong, a die, the last
 * seconds' tick, winning and the end of a game. Browser only.
 *
 * Browsers only let audio start after a user gesture, so the context is
 * created/resumed on the first tap or key anywhere (`installUnlock`); before
 * that, sounds are silently skipped. Muted state lives in `localStorage`
 * (`talo.sonido`) and is shared by every game; the 3D games and Pastelería
 * keep their own audio.
 */

export type SoundName = "place" | "capture" | "turn" | "good" | "bad" | "dice" | "tick" | "win" | "end" | "flip";

const MUTE_KEY = "talo.sonido";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function isMuted(): boolean {
  return typeof window === "undefined" ? false : readMuted();
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "off" : "on");
  } catch {
    // Private mode: it just won't be remembered.
  }
  listeners.forEach((l) => l());
}

/** For `useSyncExternalStore`. */
export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

let installed = false;
/** Arms the audio on the page's first tap/key (idempotent). */
export function installUnlock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const go = () => unlock();
  window.addEventListener("pointerdown", go, { capture: true });
  window.addEventListener("keydown", go, { capture: true });
}

/** One enveloped oscillator note. */
function tone(freq: number, start: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A short burst of filtered noise (dice, captures). */
function noise(start: number, dur: number, peak: number, freq: number) {
  if (!ctx || !master) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = peak;
  src.connect(filter).connect(gain).connect(master);
  src.start(start);
}

const N = (semis: number) => 523.25 * Math.pow(2, semis / 12); // from C5

/** Plays a sound now (skipped while muted or before the first tap). */
export function playSound(name: SoundName) {
  if (typeof window === "undefined" || readMuted() || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case "place":
      tone(220, t, 0.09, "triangle", 0.35, 140);
      noise(t, 0.03, 0.25, 1800);
      break;
    case "flip":
      tone(N(7), t, 0.06, "triangle", 0.18, N(12));
      break;
    case "capture":
      noise(t, 0.12, 0.5, 900);
      tone(160, t, 0.14, "square", 0.08, 90);
      break;
    case "turn":
      tone(N(4), t, 0.18, "sine", 0.22);
      tone(N(9), t + 0.11, 0.26, "sine", 0.22);
      break;
    case "good":
      tone(N(7), t, 0.12, "triangle", 0.25);
      tone(N(12), t + 0.08, 0.22, "triangle", 0.25);
      break;
    case "bad":
      tone(N(-5), t, 0.16, "sawtooth", 0.08, N(-9));
      tone(N(-9), t + 0.12, 0.22, "sawtooth", 0.08, N(-12));
      break;
    case "dice":
      for (let i = 0; i < 4; i++) noise(t + i * 0.055 + Math.random() * 0.02, 0.04, 0.4, 2500 + Math.random() * 1500);
      break;
    case "tick":
      tone(N(12), t, 0.04, "square", 0.06);
      break;
    case "win":
      [0, 4, 7, 12].forEach((s, i) => tone(N(s), t + i * 0.1, 0.25, "triangle", 0.22));
      tone(N(16), t + 0.4, 0.6, "triangle", 0.2);
      tone(N(19), t + 0.4, 0.6, "sine", 0.12);
      break;
    case "end":
      tone(N(7), t, 0.2, "sine", 0.18);
      tone(N(4), t + 0.16, 0.2, "sine", 0.18);
      tone(N(0), t + 0.32, 0.45, "sine", 0.18);
      break;
  }
}
