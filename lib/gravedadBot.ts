import { mulberry32 } from "./random";
import { DT, newRunner, type Level, type Runner } from "./gravedadSim";
import { IDLE, MACRO, actionInput, playMacro, solve } from "./gravedadSolver";

/**
 * A bot racer: it plays the level with the real simulation, following the
 * solver's route. Now and then (more often the clumsier it is) it stops for a
 * moment like someone looking around, then finds its way again from where it
 * is — re-solving keeps moving platforms and pulses in sync. Driven by the bot
 * host: `advanceTo(t)` catches it up to the level clock.
 */
export class BotRunner {
  r: Runner;
  private route: number[] = [];
  private at = 0;
  private pause = 0;
  private retryAt = 0;
  private rand: () => number;

  constructor(
    private lv: Level,
    private skill: number,
    seed: number,
    from?: Runner
  ) {
    this.r = from ?? newRunner(lv, 0);
    this.rand = mulberry32(seed);
    // A moment to "react" at the start.
    this.pause = Math.floor(10 + this.rand() * (22 - skill * 10));
  }

  private plan() {
    const route = solve(this.lv, this.r, { maxNodes: 25_000, greed: 1.6 + (1 - this.skill) * 0.8, rand: this.rand });
    this.route = route ?? [];
    this.at = 0;
    if (!route) this.retryAt = this.r.t + 1.5;
  }

  /** Plays macro moves until the bot's clock reaches `t` (level seconds). */
  advanceTo(t: number) {
    while (!this.r.finished && this.r.t + MACRO * DT <= t) {
      if (this.r.dead > 0 || this.pause > 0) {
        if (this.r.dead <= 0) this.pause--;
        playMacro(this.lv, this.r, IDLE);
        if (this.pause === 0 && this.r.dead <= 0) this.route = [];
        continue;
      }
      if (this.at >= this.route.length) {
        if (this.r.t < this.retryAt) {
          playMacro(this.lv, this.r, IDLE);
          continue;
        }
        this.plan();
        if (!this.route.length) continue;
      }
      // On solid ground, like a person: stop to look now and then, and think
      // before a jump or a gravity change.
      if (this.r.grounded) {
        const next = actionInput(this.route[this.at]);
        const tricky = next.jump || !!next.grav;
        const chance = tricky ? 0.85 : 0.05 + (1 - this.skill) * 0.1;
        if (this.rand() < chance) {
          this.pause = Math.floor((tricky ? 4 : 3) + this.rand() * (tricky ? 8 + (1 - this.skill) * 16 : 6 + (1 - this.skill) * 12));
          continue;
        }
      }
      const alive = playMacro(this.lv, this.r, this.route[this.at++]);
      if (!alive) this.route = [];
    }
  }
}
