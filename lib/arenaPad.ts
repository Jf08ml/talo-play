import { PICK_RADIUS, type BotWorld, type Fighter, type FighterInput } from "./arenaSim";
import type { ArenaPad } from "./arena";

/**
 * Big screen: turns a phone's pad into a fighter's input, like playing on the
 * phone itself — the player aims: dragging on the pad's right side turns the
 * look (`lx`/`ly`, accumulated radians), the fighter faces and strikes where
 * it looks, and the stick walks relative to that (up = forward, sideways =
 * strafe). Presses (jump, dodge, pick) are counters. `seen` keeps what was
 * already used and the look itself.
 */

export interface PadSeen {
  j: number;
  d: number;
  p: number;
  lx: number;
  ly: number;
  /** Where this fighter looks (yaw, pitch), built from the drags. */
  yaw: number;
  pitch: number;
}

/** A jump in the accumulated look this big is a reloaded phone, not a drag. */
const LOOK_RESET = 6;

export function newPadSeen(pad: ArenaPad, yaw: number): PadSeen {
  return { j: pad.j || 0, d: pad.d || 0, p: pad.p || 0, lx: pad.lx || 0, ly: pad.ly || 0, yaw, pitch: 0 };
}

export function padInput(f: Fighter, seen: PadSeen, pad: ArenaPad, world: BotWorld): { input: FighterInput; pick: string | null } {
  // Look: apply what was dragged since the last step.
  const dlx = (pad.lx || 0) - seen.lx;
  const dly = (pad.ly || 0) - seen.ly;
  if (Math.abs(dlx) < LOOK_RESET) seen.yaw -= dlx;
  if (Math.abs(dly) < LOOK_RESET) seen.pitch = Math.max(-1.2, Math.min(1.2, seen.pitch - dly));
  seen.lx = pad.lx || 0;
  seen.ly = pad.ly || 0;

  const mx = Math.max(-1, Math.min(1, pad.x || 0));
  const mz = Math.max(-1, Math.min(1, pad.y || 0));
  const mag = Math.min(1, Math.hypot(mx, mz));

  // Presses since the last step (a reloaded phone starts its counters again).
  for (const k of ["j", "d", "p"] as const) if ((pad[k] || 0) < seen[k]) seen[k] = pad[k] || 0;
  const jump = (pad.j || 0) > seen.j;
  const dodge = (pad.d || 0) > seen.d;
  const pickPressed = (pad.p || 0) > seen.p;
  seen.j = pad.j || 0;
  seen.d = pad.d || 0;
  seen.p = pad.p || 0;

  let pick: string | null = null;
  if (pickPressed) {
    let best = PICK_RADIUS;
    for (const it of world.items) {
      const d = Math.hypot(it.x - f.x, it.z - f.z);
      if (d < best) {
        best = d;
        pick = it.id;
      }
    }
  }

  return {
    input: {
      mx,
      mz,
      yaw: seen.yaw,
      pitch: seen.pitch,
      jump,
      attack: !!pad.a,
      block: !!pad.b,
      // Like on the phone: pushing the stick all the way forward runs.
      sprint: mz > 0.6 && mag > 0.92 && !pad.a && !pad.b,
      dodge,
    },
    pick,
  };
}
