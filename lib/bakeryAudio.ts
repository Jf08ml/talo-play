/**
 * Pastelería sounds, synthesized with Web Audio (no files): soft pops when
 * picking ingredients, a jingle for a right cake, a "boing" for a wrong
 * one, a fanfare per level, the last seconds' ticks, and an optional music
 * box loop. Browser only.
 *
 * The context is created on `unlock()`, called from a tap ("Jugar"), so
 * nothing plays before the player interacts. Effects and music have their
 * own switches; `volume` scales both.
 */

const MELODY = [
  // [semitones from C5, beats]; -1 = rest. A gentle music-box tune.
  [0, 1], [4, 1], [7, 1], [4, 1], [5, 1], [9, 1], [7, 2],
  [4, 1], [7, 1], [12, 1], [11, 1], [9, 1], [7, 1], [4, 2],
  [5, 1], [9, 1], [7, 1], [4, 1], [2, 1], [5, 1], [4, 2],
  [2, 1], [4, 1], [5, 1], [7, 1], [4, 1], [2, 1], [0, 2],
] as const;
const BASS = [0, -5, -3, -8, -7, -5, -8, -12];
const BEAT = 0.34;

const note = (semis: number, base = 523.25) => base * Math.pow(2, semis / 12);

export class BakeryAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxOn = true;
  private musicOn = true;
  private volume = 0.7;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private step = 0;
  private musicPlaying = false;

  /** Creates/resumes the audio context (call from a user gesture). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      try {
        this.ctx = new Ctx();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.apply();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  private apply() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.22 : 0, t, 0.1);
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.apply();
  }

  setMusicEnabled(on: boolean) {
    this.musicOn = on;
    this.apply();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.apply();
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, bus: GainNode, slideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  /** Picking an ingredient: a soft pop, a bit higher for each step. */
  pick(step = 0) {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx!.currentTime;
    const f = note(step * 2, 660);
    this.tone(f, t, 0.12, "sine", 0.35, this.sfxBus!, f * 1.6);
    this.tone(f * 2, t + 0.01, 0.06, "triangle", 0.08, this.sfxBus!);
  }

  /** A UI tap (tabs, pause). */
  click() {
    if (!this.ready || !this.sfxOn) return;
    this.tone(1200, this.ctx!.currentTime, 0.04, "triangle", 0.12, this.sfxBus!);
  }

  right() {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7, 12].forEach((s, i) => this.tone(note(s), t + i * 0.09, 0.3, "triangle", 0.3, this.sfxBus!));
    this.tone(note(16), t + 0.38, 0.5, "sine", 0.25, this.sfxBus!);
  }

  wrong() {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx!.currentTime;
    this.tone(330, t, 0.22, "sine", 0.35, this.sfxBus!, 220);
    this.tone(260, t + 0.2, 0.3, "sine", 0.3, this.sfxBus!, 160);
  }

  levelUp() {
    if (!this.ready || !this.sfxOn) return;
    const t = this.ctx!.currentTime;
    [0, 4, 7, 4, 7, 12].forEach((s, i) => this.tone(note(s), t + i * 0.12, 0.28, "square", 0.12, this.sfxBus!));
    [0, 4, 7, 12].forEach((s) => this.tone(note(s, 261.63), t + 0.72, 0.9, "triangle", 0.18, this.sfxBus!));
  }

  /** Last seconds on the clock. */
  tick() {
    if (!this.ready || !this.sfxOn) return;
    this.tone(1500, this.ctx!.currentTime, 0.05, "square", 0.06, this.sfxBus!);
  }

  // ---- Music -----------------------------------------------------------------

  /** Starts (or resumes) the music box loop. */
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.nextBeat = this.ctx.currentTime + 0.1;
    // Schedule a little ahead so timers jitter doesn't skip notes.
    this.musicTimer = setInterval(() => this.schedule(), 120);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule() {
    if (!this.ctx || !this.musicBus || this.ctx.state !== "running") return;
    while (this.nextBeat < this.ctx.currentTime + 0.5) {
      const [semis, beats] = MELODY[this.step % MELODY.length];
      const t = this.nextBeat;
      if (semis >= 0) {
        this.tone(note(semis), t, BEAT * beats * 1.6, "sine", 0.5, this.musicBus);
        this.tone(note(semis + 12), t, BEAT * 0.5, "triangle", 0.08, this.musicBus);
      }
      if (this.step % 4 === 0) {
        const b = BASS[Math.floor(this.step / 4) % BASS.length];
        this.tone(note(b, 130.81), t, BEAT * 3.5, "triangle", 0.35, this.musicBus);
      }
      this.nextBeat += BEAT * beats;
      this.step++;
    }
  }

  dispose() {
    this.stopMusic();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
