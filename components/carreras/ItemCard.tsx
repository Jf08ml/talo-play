"use client";

import { ChevronsUp, Droplet, Rocket, Shield, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { ITEMS, isItem, type ItemId } from "@/lib/carrerasItems";

/** Each power's icon (the «Poder» button and the race's power card). */
export const ITEM_ICONS: Record<ItemId, LucideIcon> = { turbo: Zap, turbo3: ChevronsUp, escudo: Shield, aceite: Droplet, cohete: Rocket };

const ROLL_ORDER: ItemId[] = ["turbo", "escudo", "aceite", "cohete", "turbo3"];

/**
 * The power held, big over the race (like a kart game's item box): the
 * roulette turning, then the power's icon in its color, pulsing, with how to
 * use it. Nothing when there's none.
 */
export function ItemCard({ id, rolling, hint, size = "md" }: { id: string; rolling: boolean; hint?: string; size?: "sm" | "md" | "lg" }) {
  if (!isItem(id)) return null;
  const box = size === "lg" ? "h-28 w-28" : size === "sm" ? "h-16 w-16" : "h-20 w-20";
  const icon = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12";
  if (rolling) {
    // The roulette: the icons flick by (a CSS step animation), in white.
    return (
      <div className="flex flex-col items-center gap-1">
        <div className={`relative ${box} overflow-hidden rounded-2xl border-4 border-white/80 bg-slate-950/70 shadow-[0_0_24px_rgba(255,255,255,0.35)] backdrop-blur`}>
          <div className="item-roulette absolute inset-x-0 top-0 flex flex-col">
            {[...ROLL_ORDER, ROLL_ORDER[0]].map((r, i) => {
              const Icon = ITEM_ICONS[r];
              return (
                <div key={i} className={`flex ${box} shrink-0 items-center justify-center`}>
                  <Icon className={`${icon} text-white`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  const item = ITEMS[id];
  const Icon = ITEM_ICONS[id];
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex ${box} animate-pulse items-center justify-center rounded-2xl border-4 backdrop-blur`}
        style={{ borderColor: item.color, backgroundColor: `${item.color}33`, boxShadow: `0 0 28px ${item.color}` }}
      >
        <Icon className={icon} style={{ color: item.color }} />
      </div>
      <p className="rounded-lg bg-slate-950/75 px-2 py-0.5 text-center text-xs font-bold text-white">
        {item.label}
        {hint && <span className="block text-[10px] font-semibold text-slate-300">{hint}</span>}
      </p>
    </div>
  );
}

export { Sparkles as NoItemIcon };
