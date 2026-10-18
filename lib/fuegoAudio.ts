import type { WeaponId } from "./fuegoSim";

/**
 * Fuego cruzado sounds, synthesized with Web Audio (no files): each weapon's
 * shot, reloads, the empty click, explosions, hits (a tick when yours land,
 * a crackle on shields), the shield alarm, pickups, the countdown and the
 * start. Browser only; the context resumes on the first tap or key.
 */
export class FuegoAudio {
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
    this.master.gain.value = 0.75;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, this.unlock, { passive: true });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.75, this.ctx.currentTime, 0.05);
  }

  private get live(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

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
    g.gain.exponentialRampToValueAtTime(vol, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.out(pan));
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private hiss(type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, pan = 0, attack = 0.02, start?: number) {
    const ctx = this.ctx!;
    const t = start ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === "bandpass" ? 1.5 : 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.max(0.002, dur * attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /** A shot of `weapon`; `vol` and `pan` place it (yours at full volume). */
  shot(weapon: WeaponId, vol = 1, pan = 0) {
    if (!this.live || vol < 0.02) return;
    const t = this.ctx!.currentTime;
    if (weapon === "rifle") {
      this.hiss("lowpass", 5000, 400, 0.12, 0.55 * vol, pan);
      this.tone(160, t, 0.08, "square", 0.12 * vol, 60, pan);
    } else if (weapon === "pistola") {
      this.hiss("lowpass", 6000, 500, 0.16, 0.6 * vol, pan);
      this.tone(220, t, 0.1, "square", 0.14 * vol, 70, pan);
    } else if (weapon === "escopeta") {
      this.hiss("lowpass", 3000, 150, 0.35, 0.9 * vol, pan);
      this.tone(90, t, 0.25, "sine", 0.6 * vol, 40, pan);
      // The pump.
      this.hiss("bandpass", 1800, 1200, 0.06, 0.15 * vol, pan, 0.1, t + 0.45);
      this.hiss("bandpass", 1400, 900, 0.06, 0.15 * vol, pan, 0.1, t + 0.6);
    } else if (weapon === "francotirador") {
      this.hiss("lowpass", 8000, 200, 0.6, 0.9 * vol, pan);
      this.tone(70, t, 0.5, "sine", 0.6 * vol, 30, pan);
      this.tone(2400, t, 0.3, "sine", 0.04 * vol, 1200, pan);
    } else {
      this.hiss("bandpass", 600, 2400, 0.5, 0.5 * vol, pan, 0.3);
      this.tone(120, t, 0.3, "sawtooth", 0.08 * vol, 60, pan);
    }
  }

  reload() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.hiss("bandpass", 2500, 2000, 0.05, 0.2, 0, 0.1, t + 0.1);
    this.tone(900, t + 0.35, 0.04, "square", 0.06);
    this.hiss("bandpass", 3000, 2200, 0.06, 0.22, 0, 0.1, t + 0.7);
  }

  empty() {
    if (!this.live) return;
    this.tone(1800, this.ctx!.currentTime, 0.03, "square", 0.08);
  }

  switchWeapon() {
    if (!this.live) return;
    this.hiss("bandpass", 1800, 1200, 0.08, 0.15);
  }

  melee(vol = 1, pan = 0) {
    if (!this.live) return;
    this.hiss("bandpass", 500, 1600, 0.18, 0.3 * vol, pan, 0.5);
  }

  throwGrenade() {
    if (!this.live) return;
    this.hiss("bandpass", 700, 1500, 0.2, 0.2, 0, 0.5);
  }

  explosion(vol = 1, pan = 0) {
    if (!this.live || vol < 0.02) return;
    const t = this.ctx!.currentTime;
    this.hiss("lowpass", 2400, 60, 1.4, 1 * vol, pan, 0.01);
    this.tone(55, t, 0.9, "sine", 0.8 * vol, 25, pan);
    this.hiss("bandpass", 300, 120, 0.8, 0.4 * vol, pan, 0.05, t + 0.05);
  }

  /** Your shot landed: a short tick (higher on the head, a chime on a kill). */
  hitMarker(head: boolean, kill: boolean) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(head ? 2200 : 1600, t, 0.05, "square", 0.07);
    if (kill) {
      this.tone(880, t + 0.06, 0.12, "triangle", 0.12);
      this.tone(1320, t + 0.13, 0.18, "triangle", 0.1);
    }
  }

  /** You got hit: a crackle on the shield, a thump on the body. */
  hurt(shield: boolean) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (shield) this.hiss("highpass", 4000, 7000, 0.12, 0.25);
    else {
      this.tone(80, t, 0.22, "sine", 0.6, 40);
      this.hiss("lowpass", 1200, 200, 0.15, 0.3);
    }
  }

  /** A bullet flying past your head. */
  whizz(pan = 0) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.hiss("bandpass", 5000, 1200, 0.16, 0.22, pan, 0.4);
    this.tone(2600, t, 0.12, "sine", 0.03, 900, pan);
  }

  /** Your shield just broke: a glassy crack. */
  shieldBreak() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.hiss("highpass", 6000, 2500, 0.35, 0.4, 0, 0.02);
    for (const f of [1900, 2500, 3300]) this.tone(f, t, 0.3, "triangle", 0.05, f * 0.6);
  }

  /** Your shield is gone: the alarm, a beep. */
  shieldAlarm() {
    if (!this.live) return;
    this.tone(1250, this.ctx!.currentTime, 0.07, "square", 0.05);
  }

  /** The shield starts recharging. */
  shieldCharge() {
    if (!this.live) return;
    this.tone(300, this.ctx!.currentTime, 0.6, "sine", 0.08, 900);
  }

  pickup() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(660, t, 0.1, "triangle", 0.14);
    this.tone(990, t + 0.06, 0.15, "triangle", 0.12);
  }

  death() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(200, t, 0.8, "sawtooth", 0.08, 50);
    this.hiss("lowpass", 1500, 100, 0.8, 0.3);
  }

  step(vol = 0.3) {
    if (!this.live) return;
    this.hiss("lowpass", 900, 300, 0.06, 0.12 * vol);
  }

  beep() {
    if (!this.live) return;
    this.tone(660, this.ctx!.currentTime, 0.18, "square", 0.1);
  }

  go() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    this.tone(880, t, 0.5, "square", 0.12);
    this.tone(1320, t, 0.5, "square", 0.06);
  }

  dispose() {
    if (typeof window !== "undefined") {
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.removeEventListener(ev, this.unlock);
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
