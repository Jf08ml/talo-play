import type { FuegoPad } from "./fuego";
import type { ArsenalInput, SoldierInput } from "./fuegoSim";

/**
 * Big screen: turns a phone's pad into a soldier's input, like playing on
 * the phone itself. Drags on the pad's right side turn the look (`lx`/`ly`,
 * accumulated radians); the look glides after them so the bursts that arrive
 * over the network still turn the view smoothly. The stick walks relative to
 * the look. Presses are counters: a press is "down" for one step, which is
 * what the arsenal's edge detection needs. `PadSeen` keeps what was used.
 */

export interface PadSeen {
  sid: number;
  h: number;
  ft: number;
  j: number;
  r: number;
  q: number;
  g: number;
  m: number;
  p: number;
  lx: number;
  ly: number;
  yaw: number;
  pitch: number;
  aimYaw: number;
  aimPitch: number;
  /** A jump pressed in the air is kept this long (s), so it isn't lost just before landing. */
  jumpT: number;
}

/** How fast the look glides to where it was dragged (1/s). */
const LOOK_GLIDE = 30;
const JUMP_BUFFER = 0.18;
const MAX_PITCH = 1.35;

/** The pad's counters and look, taken as already used. */
function synced(pad: FuegoPad) {
  return {
    sid: pad.sid || 0,
    h: pad.h || 0,
    ft: pad.ft || 0,
    j: pad.j || 0,
    r: pad.r || 0,
    q: pad.q || 0,
    g: pad.g || 0,
    m: pad.m || 0,
    p: pad.p || 0,
    lx: pad.lx || 0,
    ly: pad.ly || 0,
  };
}

export function newPadSeen(pad: FuegoPad, yaw: number): PadSeen {
  return {
    ...synced(pad),
    yaw,
    pitch: 0,
    aimYaw: yaw,
    aimPitch: 0,
    jumpT: 0,
  };
}

/** Back on its feet: looking where the spawn faces (the counters stay). */
export function resetLook(seen: PadSeen, yaw: number) {
  seen.yaw = seen.aimYaw = yaw;
  seen.pitch = seen.aimPitch = 0;
  seen.jumpT = 0;
}

/** Recoil: the view climbs like it does on the phone. */
export function kickLook(seen: PadSeen, amount: number) {
  seen.aimPitch = Math.min(MAX_PITCH, seen.aimPitch + amount);
  seen.pitch = Math.min(MAX_PITCH, seen.pitch + amount);
}

/**
 * One step of input. `sens` scales the drags taken this step (slower while
 * zoomed in or over an enemy, like the phone's aim help); `onGround` decides
 * whether a buffered jump goes now.
 */
export function padInput(
  seen: PadSeen,
  pad: FuegoPad,
  dt: number,
  sens: number,
  onGround: boolean
): { move: Omit<SoldierInput, "aiming">; arms: Omit<ArsenalInput, "aim">; aim: boolean; pick: boolean; ability: boolean } {
  // The phone reloaded: start from what it says now, without acting on it.
  if ((pad.sid || 0) !== seen.sid) Object.assign(seen, synced(pad));
  const dlx = (pad.lx || 0) - seen.lx;
  const dly = (pad.ly || 0) - seen.ly;
  seen.aimYaw -= dlx * sens;
  seen.aimPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, seen.aimPitch - dly * sens));
  seen.lx = pad.lx || 0;
  seen.ly = pad.ly || 0;
  const k = 1 - Math.exp(-dt * LOOK_GLIDE);
  seen.yaw += (seen.aimYaw - seen.yaw) * k;
  seen.pitch += (seen.aimPitch - seen.pitch) * k;

  // Counters never go down on the same page; if they do, take them as they are.
  for (const key of ["h", "ft", "j", "r", "q", "g", "m", "p"] as const) if ((pad[key] || 0) < seen[key]) seen[key] = pad[key] || 0;
  const took = (key: "h" | "ft" | "j" | "r" | "q" | "g" | "m" | "p") => {
    const now = pad[key] || 0;
    const fresh = now > seen[key];
    seen[key] = now;
    return fresh;
  };
  const tap = took("ft");
  if (took("j")) seen.jumpT = JUMP_BUFFER;
  const jump = seen.jumpT > 0 && onGround;
  seen.jumpT = jump ? 0 : Math.max(0, seen.jumpT - dt);

  return {
    move: {
      mx: Math.max(-1, Math.min(1, pad.x || 0)),
      mz: Math.max(-1, Math.min(1, pad.y || 0)),
      yaw: seen.yaw,
      pitch: seen.pitch,
      jump,
    },
    arms: {
      fire: !!pad.f || tap,
      reload: took("r"),
      swap: took("q"),
      grenade: took("g"),
      melee: took("m"),
    },
    aim: !!pad.a,
    pick: took("p"),
    ability: took("h"),
  };
}
