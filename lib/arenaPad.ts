import { PICK_RADIUS, WEAPONS, forward, type BotWorld, type Fighter, type FighterInput, type Gear } from "./arenaSim";
import type { ArenaPad } from "./arena";

/**
 * Big screen: turns a phone's pad into a fighter's input. The stick is as seen
 * on the TV (`camYaw` is where the camera looks), so "up" walks away from the
 * camera. Nobody can aim with a mouse here, so the fighter turns by itself:
 * toward the nearest standing rival while attacking, blocking or close to one,
 * otherwise toward where it walks. Presses (jump, dodge, pick) are counters;
 * `seen` keeps the last ones used.
 */

/** Turn rate when aiming for the player (rad/s). */
const TURN = 11;
/** A rival this close is faced even without attacking. */
const FACE_RANGE = 4.5;

const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz);

export function padInput(
  f: Fighter,
  seen: { j: number; d: number; p: number },
  pad: ArenaPad,
  gear: Gear,
  world: BotWorld,
  camYaw: number,
  dt: number
): { input: FighterInput; pick: string | null } {
  const [cfx, cfz] = forward(camYaw);
  const crx = -cfz;
  const crz = cfx;
  const jx = Math.max(-1, Math.min(1, pad.x || 0));
  const jy = Math.max(-1, Math.min(1, pad.y || 0));
  const mag = Math.min(1, Math.hypot(jx, jy));
  const wx = cfx * jy + crx * jx;
  const wz = cfz * jy + crz * jx;

  let nearest: { x: number; z: number; d: number } | null = null;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - f.x, e.z - f.z);
    if (!nearest || d < nearest.d) nearest = { x: e.x, z: e.z, d };
  }

  let target = f.yaw;
  const fighting = !!pad.a || !!pad.b || (WEAPONS[gear.w].ranged && !!pad.a);
  if (nearest && (fighting || nearest.d < FACE_RANGE)) target = yawToward(nearest.x - f.x, nearest.z - f.z);
  else if (mag > 0.2) target = yawToward(wx, wz);
  let diff = target - f.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const yaw = f.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, diff));

  // The world move, in the fighter's own strafe/forward.
  const [fx, fz] = forward(yaw);
  const mz = wx * fx + wz * fz;
  const mx = wx * -fz + wz * fx;

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
    input: { mx, mz, yaw, pitch: 0, jump, attack: !!pad.a, block: !!pad.b, sprint: mag > 0.95 && !pad.a && !pad.b, dodge },
    pick,
  };
}
