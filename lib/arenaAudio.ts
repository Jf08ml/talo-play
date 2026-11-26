/**
 * Arena medieval sounds, synthesized with Web Audio (no files): swings,
 * metal on metal when a hit is blocked, thuds, the bow, pickups, the
 * countdown, the horn that starts a round and the crowd. Browser only.
 *
 * Like the races, the context stays suspended until the first tap or key.
 */

export class ArenaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
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
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
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

  /** Where a sound goes: panned and quieter with distance (`vol` already includes it). */
  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (typeof ctx.createStereoPanner !== "function" || !pan) return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, pan = 0) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.out(pan));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** Filtered noise; the band sweeps from f0 to f1. */
  private hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, pan = 0, attack = 0.2) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === "bandpass" ? 2 : 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /** A weapon cutting the air; `heavy` 0–1 makes it lower and longer. */
  swing(heavy = 0.3, vol = 1, pan = 0) {
    if (!this.live) return;
    this.hiss("bandpass", 600 - heavy * 250, 2400 - heavy * 900, 0.22 + heavy * 0.15, 0.3 * vol, pan, 0.6);
  }

  /** A blocked hit: metal ringing. */
  clang(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    for (const [f, v] of [
      [1180, 0.12],
      [1730, 0.08],
      [2650, 0.05],
      [3420, 0.035],
    ]) {
      this.tone(f * (0.97 + Math.random() * 0.06), t, 0.45, "triangle", v * vol, undefined, pan);
    }
    this.hiss("highpass", 3000, 6000, 0.08, 0.25 * vol, pan, 0.05);
  }

  /** A perfect parry: a bright ring over the clang, and a short rising "shing". */
  parry(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    for (const [f, v] of [
      [1560, 0.13],
      [2340, 0.09],
      [3120, 0.06],
      [4680, 0.035],
    ]) {
      this.tone(f, t, 0.8, "sine", v * vol, undefined, pan);
    }
    this.tone(900, t, 0.25, "triangle", 0.1 * vol, 2400, pan);
    this.hiss("highpass", 4000, 9000, 0.12, 0.3 * vol, pan, 0.05);
  }

  /** A kick: a short whoosh as the leg goes out. */
  kick(vol = 1, pan = 0) {
    if (!this.live) return;
    this.hiss("bandpass", 400, 1200, 0.16, 0.22 * vol, pan, 0.5);
  }

  /** A kick landing: a dull boot on armor. */
  kickHit(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(110, t, 0.14, "sine", 0.55 * vol, 50, pan);
    this.tone(420, t, 0.06, "square", 0.06 * vol, 200, pan);
    this.hiss("lowpass", 900, 150, 0.12, 0.35 * vol, pan, 0.05);
  }

  /** A special winding up: a rising hum (longer for the slam). */
  charge(seconds: number, vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(160, t, seconds + 0.1, "sawtooth", 0.05 * vol, 520, pan);
    this.tone(320, t, seconds + 0.1, "triangle", 0.06 * vol, 1040, pan);
    this.hiss("bandpass", 300, 2500, seconds + 0.1, 0.12 * vol, pan, 0.9);
  }

  /** The slam: a deep boom and rocks. */
  slam(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(60, t, 0.7, "sine", 0.8 * vol, 28, pan);
    this.tone(120, t, 0.3, "triangle", 0.3 * vol, 45, pan);
    this.hiss("lowpass", 3000, 120, 0.8, 0.55 * vol, pan, 0.03);
  }

  /** The whirlwind: a long whooshing spin. */
  whirl(vol = 1, pan = 0) {
    if (!this.live) return;
    this.hiss("bandpass", 500, 2600, 0.55, 0.35 * vol, pan, 0.4);
    this.hiss("bandpass", 2600, 700, 0.5, 0.2 * vol, pan, 0.6);
  }

  /** The lunge: a fast rush forward. */
  lunge(vol = 1, pan = 0) {
    if (!this.live) return;
    this.hiss("bandpass", 800, 3200, 0.3, 0.32 * vol, pan, 0.3);
    this.tone(200, this.ctx!.currentTime, 0.25, "triangle", 0.08 * vol, 500, pan);
  }

  /** A clean hit: a thud. */
  thud(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(140, t, 0.18, "sine", 0.5 * vol, 55, pan);
    this.hiss("lowpass", 1400, 200, 0.16, 0.4 * vol, pan, 0.05);
  }

  /** You got hit: a lower thud and a grunt-ish buzz. */
  hurt() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(90, t, 0.25, "sine", 0.6, 40);
    this.tone(180, t, 0.18, "sawtooth", 0.06, 110);
  }

  bow(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(220, t, 0.22, "triangle", 0.2 * vol, 160, pan);
    this.hiss("bandpass", 1800, 900, 0.25, 0.18 * vol, pan, 0.1);
  }

  /** An arrow sticking into something. */
  thunk(vol = 1, pan = 0) {
    if (!this.live) return;
    this.tone(300, this.ctx!.currentTime, 0.08, "square", 0.12 * vol, 120, pan);
  }

  pickup() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(660, t, 0.12, "triangle", 0.15);
    this.tone(990, t + 0.07, 0.18, "triangle", 0.13);
  }

  /** Health coming back (a potion, or regeneration): a soft rising sparkle. */
  heal() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.06, 0.22, "sine", 0.09));
  }

  /** A fighter falls: a heavy armored crash. */
  fall(vol = 1, pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(70, t, 0.4, "sine", 0.55 * vol, 35, pan);
    this.hiss("lowpass", 2500, 300, 0.45, 0.35 * vol, pan, 0.05);
    this.tone(1400, t + 0.05, 0.3, "triangle", 0.05 * vol, undefined, pan);
  }

  beep() {
    if (!this.live) return;
    this.tone(440, this.ctx!.currentTime, 0.2, "square", 0.12);
  }

  /** The round starts: a horn. */
  horn() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    for (const f of [196, 294, 392]) {
      const ctx = this.ctx!;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
      g.gain.setValueAtTime(0.07, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(lp).connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 1.2);
    }
  }

  /** The crowd roars (a round won, a knockout). */
  cheer(vol = 1) {
    if (!this.live) return;
    this.hiss("bandpass", 700, 1100, 1.8, 0.35 * vol, 0, 0.25);
    this.hiss("bandpass", 1500, 2200, 1.5, 0.15 * vol, 0, 0.3);
  }

  dispose() {
    if (typeof window !== "undefined") {
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(ev, this.unlock);
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
