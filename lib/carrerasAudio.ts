/**
 * Carreras sounds, synthesized with Web Audio (no files to load): an engine
 * per car whose pitch climbs through the gears, tire screech, hits, the
 * countdown beeps, lap chimes and the finish fanfare. Browser only.
 *
 * Browsers keep audio suspended until a tap or a key press, so the context
 * resumes on the first one (`unlock` listeners) — before that it's silent.
 */

/** Speed fractions where the next gear starts (the engine drops in pitch there). */
const GEARS = [0, 0.2, 0.4, 0.6, 0.8, 1.05];
const RAMP = 0.06;

interface EngineVoice {
  saw: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  skid: GainNode;
  skidSrc: AudioBufferSourceNode;
  pan: StereoPannerNode | null;
}

/** Engine speed (0.15 idle … 1 just before a shift) for a speed fraction. */
function rpm(speed: number): number {
  const v = Math.min(1, Math.abs(speed));
  for (let g = 0; g < GEARS.length - 1; g++) {
    if (v < GEARS[g + 1]) {
      const t = (v - GEARS[g]) / (GEARS[g + 1] - GEARS[g]);
      return g === 0 ? 0.15 + t * 0.85 : 0.42 + t * 0.58;
    }
  }
  return 1;
}

export class RaceAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engines = new Map<string, EngineVoice>();
  private muted = false;
  private unlock = () => {
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
  };

  constructor() {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    // A gentle limiter so four engines and a crash don't clip.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, this.unlock, { passive: true });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private get live(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

  private voice(key: string): EngineVoice | null {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return null;
    let v = this.engines.get(key);
    if (v) return v;
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    const sub = ctx.createOscillator();
    sub.type = "square";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    saw.connect(filter);
    sub.connect(subGain).connect(filter);
    filter.connect(gain);

    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = this.noise;
    skidSrc.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 3;
    const skid = ctx.createGain();
    skid.gain.value = 0;
    skidSrc.connect(band).connect(skid);

    const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    const out: AudioNode = pan ?? this.master;
    if (pan) pan.connect(this.master);
    gain.connect(out);
    skid.connect(out);
    saw.start();
    sub.start();
    skidSrc.start();
    v = { saw, sub, filter, gain, skid, skidSrc, pan };
    this.engines.set(key, v);
    return v;
  }

  /**
   * Sets a car's engine: `speed` as a fraction of top speed, `slip` 0–1 for
   * the tire screech, `volume` 0–1 (distance, or a quieter rival), `pan` −1…1.
   */
  engine(key: string, speed: number, slip = 0, volume = 1, pan = 0) {
    const v = this.voice(key);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const r = rpm(speed);
    const f = 42 + r * 100;
    v.saw.frequency.setTargetAtTime(f, t, RAMP);
    v.sub.frequency.setTargetAtTime(f / 2, t, RAMP);
    v.filter.frequency.setTargetAtTime(350 + r * 1700, t, RAMP);
    v.gain.gain.setTargetAtTime((0.05 + r * 0.06) * volume, t, RAMP);
    v.skid.gain.setTargetAtTime(Math.min(1, slip) * 0.12 * volume, t, 0.04);
    v.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, RAMP);
  }

  /** Stops engines whose car is gone (or every engine with no `keep`). */
  silence(keep: string[] = []) {
    for (const [key, v] of this.engines) {
      if (keep.includes(key)) continue;
      const stopAt = (this.ctx?.currentTime ?? 0) + 0.2;
      v.gain.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
      v.skid.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
      v.saw.stop(stopAt + 0.3);
      v.sub.stop(stopAt + 0.3);
      v.skidSrc.stop(stopAt + 0.3);
      this.engines.delete(key);
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A crash: a noise burst and a low thump, louder the harder the hit (0–1). */
  hit(strength: number) {
    if (!this.live) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const k = Math.max(0.15, Math.min(1, strength));
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2500, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * k, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, 0.35);
    this.tone(110, t, 0.22, "sine", 0.5 * k, 45);
  }

  /** Countdown: a short beep for 3, 2, 1 and a long high one for the start. */
  beep(go = false) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (go) {
      this.tone(880, t, 0.6, "square", 0.16);
      this.tone(1320, t, 0.6, "sine", 0.1);
    } else {
      this.tone(440, t, 0.22, "square", 0.14);
    }
  }

  /** A lap done; `last` = the final lap starts (a brighter triple chime). */
  lap(last = false) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    const notes = last ? [784, 988, 1319] : [659, 988];
    notes.forEach((f, i) => this.tone(f, t + i * 0.11, 0.3, "triangle", 0.16));
  }

  /** Crossing the line at the end: a little fanfare (`won` adds a final high note). */
  finish(won = false) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    const notes = won ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      this.tone(f, t + i * 0.13, i === notes.length - 1 ? 0.8 : 0.25, "square", 0.1);
      this.tone(f / 2, t + i * 0.13, 0.25, "triangle", 0.12);
    });
  }

  dispose() {
    if (typeof window !== "undefined") {
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(ev, this.unlock);
    }
    this.engines.clear();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/** What the start gantry shows: off, 1–3 red lights, or green. */
export type StartLights = 0 | 1 | 2 | 3 | "go";

/** Hits softer than this (speed into the wall or the other car) make no sound. */
const MIN_HIT = 50;
const HIT_GAP_MS = 220;

/**
 * Turns what the race loop sees every frame into one-off sounds: countdown
 * ticks, lap chimes and hits (one per car every so often, not one per step).
 */
export class RaceCues {
  private game = -1;
  private count = -1;
  private laps = new Map<string, number>();
  private lastHit = new Map<string, number>();

  constructor(private audio: RaceAudio | null) {}

  /**
   * `left`: whole seconds until the start, 0 once racing, -1 while waiting.
   * Returns what the start lights should show.
   */
  countdown(gameNo: number, left: number): StartLights {
    if (gameNo !== this.game) {
      this.game = gameNo;
      this.laps.clear();
      // Joining a race already under way: no "go" beep.
      this.count = left === 0 ? 0 : 99;
    }
    if (left !== this.count) {
      if (left > 0 && left <= 3) this.audio?.beep();
      else if (left === 0 && this.count > 0) this.audio?.beep(true);
      this.count = left;
    }
    if (left < 0) return 0;
    if (left === 0) return "go";
    return Math.max(1, Math.min(3, 4 - left)) as 1 | 2 | 3;
  }

  /** `done` laps completed out of `total`; chimes when it goes up (the finish has its own fanfare). */
  lap(key: string, done: number, total: number) {
    const prev = this.laps.get(key);
    this.laps.set(key, done);
    if (prev === undefined || done <= prev || done >= total) return;
    this.audio?.lap(done === total - 1);
  }

  /** A hit of `speed`; true when it's worth showing (sparks, shake) — it also sounds. */
  hit(key: string, speed: number): boolean {
    if (speed < MIN_HIT) return false;
    const now = performance.now();
    if (now - (this.lastHit.get(key) ?? 0) < HIT_GAP_MS) return false;
    this.lastHit.set(key, now);
    this.audio?.hit(speed / 320);
    return true;
  }
}
