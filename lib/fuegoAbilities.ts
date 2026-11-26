/**
 * Fuego cruzado's abilities: each talo picks one in the waiting room
 * (`state.kits`; bots get one at random) and uses it with C, the touch
 * button or the pad, then waits out its cooldown. Movement ones (impulso,
 * supersalto, teletransporte) run on whoever runs the soldier; radar is local
 * to its runner; the bubble changes the shield, so it's a transaction
 * (`popBubble` in lib/fuego.ts). Pure data.
 */

export type AbilityId = "impulso" | "salto" | "teletransporte" | "radar" | "burbuja";

/** APPEND-ONLY (poses send the index). */
export const ABILITY_IDS: AbilityId[] = ["impulso", "salto", "teletransporte", "radar", "burbuja"];

export const ABILITY_INFO: Record<AbilityId, { label: string; hint: string; cooldown: number; color: string }> = {
  impulso: { label: "Impulso", hint: "Un empujón rápido hacia donde te mueves: para esquivar o escapar.", cooldown: 4, color: "#FF7A1A" },
  salto: { label: "Supersalto", hint: "Un salto altísimo: sube a donde nadie llega.", cooldown: 5, color: "#00B26B" },
  teletransporte: { label: "Teletransporte", hint: "Apareces 7 metros adelante, de golpe.", cooldown: 8, color: "#8A4DFF" },
  radar: { label: "Radar", hint: "Durante 5 segundos ves a todos los rivales en tu radar.", cooldown: 12, color: "#2D5BFF" },
  burbuja: { label: "Burbuja", hint: "Escudo lleno y 50 extra por unos segundos.", cooldown: 16, color: "#FF5FA2" },
};

export const DASH_SPEED = 17;
export const SUPER_JUMP = 11.5;
export const BLINK_DIST = 7;
export const RADAR_MS = 5000;
export const OVERSHIELD = 50;

/** The ability a fighter has when it didn't pick one (from its id, so it's the same everywhere). */
export function defaultKit(id: string): AbilityId {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) | 0;
  return ABILITY_IDS[Math.abs(h) % ABILITY_IDS.length];
}
