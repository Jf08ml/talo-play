/**
 * Carreras sounds, synthesized with Web Audio (no files to load): an engine
 * per car whose pitch climbs through the gears, tire screech, hits, jumps and
 * landings, boosts, the countdown beeps, lap chimes and the finish fanfare;
 * and the stunts: drift sparks crackling with a chime per color, a mini-turbo
 * blast that grows with its color, a trick's spin and its landing (a «ta-dá»,
 * or a thud), and the slipstream's wind and push. Browser only.
 *
 * Browsers keep audio suspended until a tap or a key press, so the context
 * resumes on the first one (`unlock` listeners) — before that it's silent.
 */

import { DRAFT_CHARGE, driftTier, type Car } from "./carrerasTrack";

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
  /** The slipstream's wind (low noise), up while it charges. */
  wind: GainNode;
  windSrc: AudioBufferSourceNode;
  pan: StereoPannerNode | null;
  /** The recorded loops (when loaded): engine low/high, tire screech, wind, drift sparks. */
  rec: {
    idle: AudioBufferSourceNode;
    /** One steady engine tone, pitched by speed. */
    eng: AudioBufferSourceNode;
    idleG: GainNode;
    engG: GainNode;
    loops: AudioBufferSourceNode[];
    skid: GainNode;
    wind: GainNode;
    spark: GainNode;
  } | null;
  /** The gear it's in, the speed last frame, a shift's dip until, the last launch, and whether it's drifting. */
  gear: number;
  lastSpeed: number;
  dipUntil: number;
  launchAt: number;
  drifting: boolean;
}

/** The recorded sounds (public/sounds/carreras, made with ElevenLabs); any that fails keeps its synthesized one. */
const SAMPLE_NAMES = [
  "motor-parejo", "motor-ralenti", "arranque", "cambio", "derrape", "chispas", "rebufo", "nivel-derrape", "miniturbo", "miniturbo-morado", "turbo", "salto", "aterrizaje",
  "truco-giro", "truco-bien", "truco-mal", "choque", "caja", "escudo", "escudo-golpe", "aceite", "cohete", "trompo", "cuenta", "largada", "vuelta", "final",
] as const;
type SampleName = (typeof SAMPLE_NAMES)[number];
const LOOPS: SampleName[] = ["motor-ralenti", "motor-parejo", "derrape", "rebufo", "chispas"];

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
  private samples = new Map<SampleName, AudioBuffer>();
  /** The tunnel's echo: everything also goes through a short reverb, up only under a roof. */
  private echo: GainNode | null = null;
  private inTunnel = false;
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
    // A concrete tube's reverb: a made-up impulse of decaying noise, off until a tunnel.
    const verb = this.ctx.createConvolver();
    const irLen = Math.floor(this.ctx.sampleRate * 1.1);
    const ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
    }
    verb.buffer = ir;
    this.echo = this.ctx.createGain();
    this.echo.gain.value = 0;
    this.master.connect(verb).connect(this.echo).connect(comp);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, this.unlock, { passive: true });
    void this.loadSamples();
  }

  /** Fetches and decodes the recorded sounds; once the loops are in, the engines restart with them. */
  private async loadSamples() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      SAMPLE_NAMES.map(async (name) => {
        try {
          const res = await fetch(`/sounds/carreras/${name}.mp3`);
          if (!res.ok) return;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.samples.set(name, buf);
        } catch {
          // Keeps the synthesized one.
        }
      })
    );
    if (this.ctx && LOOPS.every((n) => this.samples.has(n))) this.silence();
  }

  /** Plays a recorded one-shot; false if it isn't loaded (the caller synthesizes instead). */
  private sample(name: SampleName, vol: number, pan = 0, rate = 1): boolean {
    const buf = this.samples.get(name);
    if (!buf) return false;
    if (!this.live) return true;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.panned(pan));
    src.start();
    return true;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Under a tunnel's roof (the echo fades in) or out in the open. */
  setTunnel(inside: boolean) {
    if (inside === this.inTunnel || !this.ctx || !this.echo) return;
    this.inTunnel = inside;
    this.echo.gain.setTargetAtTime(inside ? 0.55 : 0, this.ctx.currentTime, 0.12);
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

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 700;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    windSrc.connect(low).connect(wind);

    const pan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    const out: AudioNode = pan ?? this.master;
    if (pan) pan.connect(this.master);
    gain.connect(out);
    skid.connect(out);
    wind.connect(out);
    saw.start();
    sub.start();
    skidSrc.start();
    windSrc.start();
    let rec: EngineVoice["rec"] = null;
    if (LOOPS.every((n) => this.samples.has(n))) {
      const loop = (name: SampleName) => {
        const src = ctx.createBufferSource();
        src.buffer = this.samples.get(name)!;
        src.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(out);
        // Each car starts its loop at a different point, so four engines don't sound as one.
        src.start(0, Math.random() * src.buffer.duration);
        return { src, g };
      };
      const id = loop("motor-ralenti");
      const en = loop("motor-parejo");
      const sk = loop("derrape");
      const wi = loop("rebufo");
      const sp = loop("chispas");
      rec = {
        idle: id.src,
        eng: en.src,
        idleG: id.g,
        engG: en.g,
        loops: [id.src, en.src, sk.src, wi.src, sp.src],
        skid: sk.g,
        wind: wi.g,
        spark: sp.g,
      };
    }
    v = { saw, sub, filter, gain, skid, skidSrc, wind, windSrc, pan, rec, gear: 0, lastSpeed: 0, dipUntil: 0, launchAt: -9, drifting: false };
    this.engines.set(key, v);
    return v;
  }

  /**
   * Sets a car's engine: `speed` as a fraction of top speed, `slip` 0–1 for
   * the tire screech, `volume` 0–1 (distance, or a quieter rival), `pan` −1…1,
   * `throttle` whether the gas is pressed (off: the engine drops and quiets).
   */
  engine(key: string, speed: number, slip = 0, volume = 1, pan = 0, throttle = true) {
    const v = this.voice(key);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    const r = rpm(speed);
    const f = 42 + r * 100;
    v.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, RAMP);
    if (v.rec) {
      const sp = Math.min(1.3, Math.abs(speed));
      // The gear (rpm drops at each shift): going up one while speeding up, the shift's clunk and a short dip.
      let gear = 0;
      while (gear < GEARS.length - 2 && sp >= GEARS[gear + 1]) gear++;
      // A quiet clunk on each upshift with the gas down (only the player's own car, or a close one).
      if (gear > v.gear && sp > v.lastSpeed && throttle && volume > 0.5) {
        v.dipUntil = t + 0.1;
        this.sample("cambio", 0.22 * volume, pan);
      }
      // Pulling away from a stop: the launch roar (not again for a while).
      if (v.lastSpeed < 0.04 && sp >= 0.04 && sp > v.lastSpeed && throttle && t - v.launchAt > 2.5) {
        v.launchAt = t;
        this.sample("arranque", 0.45 * volume, pan);
      }
      v.gear = gear;
      v.lastSpeed = sp;
      // Idle when (almost) stopped; then one steady engine tone whose pitch follows the speed, with a
      // gentle dip at each shift (mostly the speed, a little of the gearbox, so it never jumps around).
      // Off the gas it drops a little and quiets.
      const base = 0.36 * volume * (t < v.dipUntil ? 0.6 : 1) * (throttle ? 1 : 0.65);
      const idle = Math.max(0, Math.min(1, 1 - sp / 0.05));
      const revs = sp * 0.75 + r * 0.25;
      v.rec.idleG.gain.setTargetAtTime(base * idle, t, RAMP);
      v.rec.engG.gain.setTargetAtTime(base * (1 - idle), t, RAMP);
      v.rec.eng.playbackRate.setTargetAtTime((0.55 + revs * 0.95) * (throttle ? 1 : 0.92), t, 0.05);
      // Tire screech: by how much it slides, and loud all through a drift.
      const screech = Math.max(Math.min(1, Math.max(0, slip)) * 0.5, v.drifting ? 0.85 : 0);
      v.rec.skid.gain.setTargetAtTime(screech * volume, t, 0.05);
      return;
    }
    v.saw.frequency.setTargetAtTime(f, t, RAMP);
    v.sub.frequency.setTargetAtTime(f / 2, t, RAMP);
    v.filter.frequency.setTargetAtTime(350 + r * 1700, t, RAMP);
    v.gain.gain.setTargetAtTime((0.05 + r * 0.06) * volume, t, RAMP);
    v.skid.gain.setTargetAtTime(Math.min(1, slip) * 0.12 * volume, t, 0.04);
  }

  /** Stops engines whose car is gone (or every engine with no `keep`). */
  silence(keep: string[] = []) {
    for (const [key, v] of this.engines) {
      if (keep.includes(key)) continue;
      const stopAt = (this.ctx?.currentTime ?? 0) + 0.2;
      v.gain.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
      v.skid.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
      v.wind.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
      v.saw.stop(stopAt + 0.3);
      v.sub.stop(stopAt + 0.3);
      v.skidSrc.stop(stopAt + 0.3);
      v.windSrc.stop(stopAt + 0.3);
      if (v.rec) {
        for (const g of [v.rec.idleG, v.rec.engG, v.rec.skid, v.rec.wind, v.rec.spark]) g.gain.setTargetAtTime(0, stopAt - 0.2, 0.05);
        for (const src of v.rec.loops) src.stop(stopAt + 0.3);
      }
      this.engines.delete(key);
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, pan = 0) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.panned(pan));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A crash: a noise burst and a low thump, louder the harder the hit (0–1). */
  hit(strength: number) {
    if (!this.live) return;
    if (this.sample("choque", 0.35 + 0.45 * Math.max(0.15, Math.min(1, strength)))) return;
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

  /** Where a one-off sound goes: the master, through a panner when there's one. */
  private panned(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || typeof ctx.createStereoPanner !== "function") return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }

  /** A burst of filtered noise whose band sweeps from `f0` to `f1` (whooshes). */
  private sweep(f0: number, f1: number, dur: number, vol: number, pan = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 2.5;
    band.frequency.setValueAtTime(f0, t);
    band.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const out: AudioNode = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : this.master!;
    if (out !== this.master) {
      (out as StereoPannerNode).pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(this.master!);
    }
    src.connect(band).connect(g).connect(out);
    src.start(t, Math.random() * 0.4, dur + 0.05);
  }

  /** Taking off from a ramp or a crest: a rising whoosh. */
  jump(pan = 0) {
    if (!this.live) return;
    if (this.sample("salto", 0.5, pan)) return;
    this.sweep(500, 2200, 0.35, 0.35, pan);
  }

  /** Touching down; `strength` 0–1 by how long it flew. */
  land(strength: number, pan = 0) {
    if (!this.live) return;
    if (this.sample("aterrizaje", 0.3 + 0.4 * Math.max(0.2, Math.min(1, strength)), pan)) return;
    const k = Math.max(0.2, Math.min(1, strength));
    this.tone(90, this.ctx!.currentTime, 0.18, "sine", 0.45 * k, 40);
    this.sweep(900, 250, 0.2, 0.3 * k, pan);
  }

  /** Over a boost pad: a fast rising whoosh with a little zap. */
  boost(pan = 0) {
    if (!this.live) return;
    if (this.sample("turbo", 0.55, pan)) return;
    const t = this.ctx!.currentTime;
    this.sweep(300, 3200, 0.5, 0.4, pan);
    this.tone(330, t, 0.35, "sawtooth", 0.06, 990);
  }

  /** One spark under a drift: a tiny bright tick (several a second make the crackle). */
  crackle(pan = 0) {
    if (!this.live) return;
    // With the recordings, the sparks are a loop on the car's voice (`sparks`).
    if (this.samples.has("chispas")) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3500 + Math.random() * 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(hp).connect(g).connect(this.panned(pan));
    src.start(t, Math.random() * 0.8, 0.04);
  }

  /** A drift's sparks change color: a short chime, higher for each (1 blue, 2 orange, 3 purple). */
  driftLevel(tier: number, pan = 0) {
    if (!this.live) return;
    if (this.sample("nivel-derrape", 0.5, pan, [1, 1, 1.19, 1.41][Math.max(1, Math.min(3, tier))])) return;
    const t = this.ctx!.currentTime;
    const f = [0, 880, 1175, 1568][Math.max(1, Math.min(3, tier))];
    this.tone(f, t, 0.18, "triangle", 0.13, undefined, pan);
    this.tone(f * 2, t, 0.1, "sine", 0.05, undefined, pan);
  }

  /** A mini-turbo: a blast, longer and stronger for orange (2) and much more for purple (3). */
  miniTurbo(tier: number, pan = 0) {
    if (!this.live) return;
    if (this.sample(tier >= 3 ? "miniturbo-morado" : "miniturbo", tier >= 3 ? 0.7 : 0.45 + tier * 0.1, pan, tier === 2 ? 0.92 : 1)) return;
    const t = this.ctx!.currentTime;
    const k = Math.max(1, Math.min(3, tier));
    this.tone(120 - k * 15, t, 0.15 + k * 0.08, "sine", 0.35 + k * 0.1, 40, pan);
    this.sweep(250, 2400 + k * 900, 0.35 + k * 0.15, 0.3 + k * 0.08, pan);
    this.tone(260 + k * 60, t, 0.3 + k * 0.12, "sawtooth", 0.05 + k * 0.02, 900 + k * 400, pan);
  }

  /** A trick starting: a quick spin, two whooshes going round. */
  trickSpin(pan = 0) {
    if (!this.live) return;
    if (this.sample("truco-giro", 0.5, pan)) return;
    this.sweep(700, 2600, 0.18, 0.28, pan);
    setTimeout(() => this.live && this.sweep(2600, 700, 0.2, 0.24, pan), 170);
  }

  /** Landing a trick: «¡ta-dá!» when it's done in time, a dull thud when still spinning. */
  trickLand(ok: boolean, pan = 0) {
    if (!this.live) return;
    if (this.sample(ok ? "truco-bien" : "truco-mal", 0.55, pan)) return;
    const t = this.ctx!.currentTime;
    if (ok) {
      this.tone(784, t, 0.12, "square", 0.09, undefined, pan);
      this.tone(1175, t + 0.11, 0.3, "square", 0.1, undefined, pan);
      this.tone(1568, t + 0.11, 0.3, "triangle", 0.07, undefined, pan);
    } else {
      this.tone(70, t, 0.3, "sine", 0.5, 35, pan);
      this.sweep(500, 120, 0.3, 0.25, pan);
    }
  }

  /** The slipstream's wind on a car's voice: `level` 0 (none) … 1 (about to push). */
  draftWind(key: string, level: number) {
    const v = this.engines.get(key);
    if (!v || !this.ctx) return;
    const k = Math.max(0, Math.min(1, level));
    if (v.rec) v.rec.wind.gain.setTargetAtTime(k * 0.4, this.ctx.currentTime, 0.08);
    else v.wind.gain.setTargetAtTime(k * 0.1, this.ctx.currentTime, 0.08);
  }

  /** A drift's sparks crackling on a car's voice: `level` 0 (none) … 1 (purple). Recorded loop only. */
  sparks(key: string, level: number) {
    const v = this.engines.get(key);
    if (!v) return;
    v.drifting = level > 0;
    if (!v.rec || !this.ctx) return;
    v.rec.spark.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.5, this.ctx.currentTime, 0.06);
  }

  /** The slipstream's push: a long airy whoosh. */
  draftPush(pan = 0) {
    if (!this.live) return;
    if (this.sample("turbo", 0.45, pan, 0.85)) return;
    this.sweep(200, 1800, 0.6, 0.32, pan);
  }

  /** A box taken: the roulette's quick ticks, rising. */
  roulette(pan = 0) {
    if (!this.live) return;
    if (this.sample("caja", 0.5, pan)) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 8; i++) this.tone(600 + i * 70, t + i * 0.12, 0.05, "square", 0.05, undefined, pan);
  }

  /** A shield up: a bright shimmer. */
  shieldUp(pan = 0) {
    if (!this.live) return;
    if (this.sample("escudo", 0.55, pan)) return;
    const t = this.ctx!.currentTime;
    this.tone(660, t, 0.5, "sine", 0.1, 1320, pan);
    this.tone(990, t + 0.05, 0.45, "triangle", 0.06, 1980, pan);
  }

  /** A shield taking a hit: a metallic clang. */
  shieldBlock(pan = 0) {
    if (!this.live) return;
    if (this.sample("escudo-golpe", 0.6, pan)) return;
    const t = this.ctx!.currentTime;
    this.tone(1250, t, 0.35, "triangle", 0.14, 900, pan);
    this.tone(1870, t, 0.25, "sine", 0.08, 1400, pan);
  }

  /** Oil dropped: a wet splat. */
  splat(pan = 0) {
    if (!this.live) return;
    if (this.sample("aceite", 0.6, pan)) return;
    this.sweep(1400, 200, 0.25, 0.3, pan);
    this.tone(160, this.ctx!.currentTime, 0.15, "sine", 0.25, 70, pan);
  }

  /** A rocket off: a hiss rising into a roar. */
  rocketLaunch(pan = 0) {
    if (!this.live) return;
    if (this.sample("cohete", 0.55, pan)) return;
    this.sweep(400, 3000, 0.7, 0.35, pan);
    this.tone(90, this.ctx!.currentTime, 0.5, "sawtooth", 0.08, 220, pan);
  }

  /** Spun out (a rocket or oil): a crash and the car turning round. */
  spunOut(pan = 0) {
    if (!this.live) return;
    if (this.sample("trompo", 0.65, pan)) return;
    this.hit(0.7);
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) this.tone(500 - i * 60, t + 0.1 + i * 0.18, 0.15, "triangle", 0.07, 250 - i * 30, pan);
  }

  /** Countdown: a short beep for 3, 2, 1 and a long high one for the start. */
  beep(go = false) {
    if (!this.live) return;
    if (this.sample(go ? "largada" : "cuenta", 0.5)) return;
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
    if (this.sample("vuelta", 0.5, 0, last ? 1.12 : 1)) return;
    const t = this.ctx!.currentTime;
    const notes = last ? [784, 988, 1319] : [659, 988];
    notes.forEach((f, i) => this.tone(f, t + i * 0.11, 0.3, "triangle", 0.16));
  }

  /** Crossing the line at the end: a little fanfare (`won` adds a final high note). */
  finish(won = false) {
    if (!this.live) return;
    if (this.sample("final", won ? 0.6 : 0.45)) return;
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
  /** Longest time in the air of the current flight, per car (absent = on the road). */
  private flights = new Map<string, number>();
  /** What each car was doing last frame (its stunt counts, drift color, trick), to tell what just happened. */
  private stunts = new Map<
    string,
    { pads: number; minis: number; purples: number; tricks: number; drafts: number; tier: number; spinning: boolean; ready: boolean; crackle: number; item: string; used: number; shield: number; out: boolean }
  >();

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

  /**
   * A car's seconds in the air (0 = on the road): a whoosh once it's really
   * flying (not a little hop over a bump) and a thud when it lands.
   */
  air(key: string, seconds: number, pan = 0) {
    const flight = this.flights.get(key);
    if (seconds > 0) {
      if (flight === undefined && seconds >= 0.12) {
        this.flights.set(key, seconds);
        this.audio?.jump(pan);
      } else if (flight !== undefined) {
        this.flights.set(key, seconds);
      }
    } else if (flight !== undefined) {
      this.flights.delete(key);
      this.audio?.land(flight / 0.5, pan);
    }
  }

  /**
   * A car's boosts and stunts, from its own counts (a new car each race):
   * the pad's whoosh, the drift's crackle and color chimes, the mini-turbo's
   * blast by its color, the trick's spin and landing, the slipstream's wind
   * and push. Each one once, as it happens.
   */
  stunt(key: string, car: Car, dt: number, pan = 0) {
    const tier = driftTier(car);
    const prev = this.stunts.get(key);
    const now = {
      pads: car.pads,
      minis: car.minis,
      purples: car.purples,
      tricks: car.tricks,
      drafts: car.drafts,
      tier,
      spinning: car.trick > 0,
      ready: car.trickReady,
      crackle: prev?.crackle ?? 0,
      item: car.item,
      used: car.used,
      shield: car.shield,
      out: car.spinOut > 0,
    };
    // A new car (a new race) starts counting from here.
    if (prev && car.pads >= prev.pads && car.minis >= prev.minis) {
      const a = this.audio;
      if (car.pads > prev.pads) a?.boost(pan);
      if (car.minis > prev.minis) a?.miniTurbo(car.purples > prev.purples ? 3 : Math.max(1, prev.tier), pan);
      if (car.drafts > prev.drafts) a?.draftPush(pan);
      if (now.spinning && !prev.spinning) a?.trickSpin(pan);
      if (car.tricks > prev.tricks) a?.trickLand(true, pan);
      else if (prev.ready && !now.ready) a?.trickLand(false, pan);
      if (car.drift && tier > prev.tier) a?.driftLevel(tier, pan);
      // Power-ups: a box (the roulette), what was used (by what it was), a spin-out, a shield taking a hit.
      if (car.item && !prev.item && car.used === prev.used) a?.roulette(pan);
      if (car.used > prev.used) {
        if (prev.item === "turbo" || prev.item === "turbo3") a?.miniTurbo(2, pan);
        else if (prev.item === "escudo") a?.shieldUp(pan);
        else if (prev.item === "aceite") a?.splat(pan);
        else if (prev.item === "cohete") a?.rocketLaunch(pan);
      }
      if (now.out && !prev.out) a?.spunOut(pan);
      else if (prev.shield > 0.1 && car.shield === 0 && car.used === prev.used) a?.shieldBlock(pan);
      // Drifting: sparks crackle, faster with each color.
      if (car.drift) {
        now.crackle += dt * (8 + tier * 7);
        while (now.crackle >= 1) {
          now.crackle -= 1;
          a?.crackle(pan);
        }
      } else now.crackle = 0;
    }
    this.audio?.draftWind(key, Math.max(0, car.draft) / DRAFT_CHARGE);
    this.audio?.sparks(key, car.drift ? 0.35 + tier * 0.22 : 0);
    this.stunts.set(key, now);
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
