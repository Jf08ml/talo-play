"use client";

import { useState } from "react";
import GameLobby from "@/components/GameLobby";
import OnlineTabs from "@/components/OnlineTabs";
import { CreateRoomForm } from "@/components/RoomSettings";
import { chipClass } from "@/components/ui";
import { VARIANTS, createTriquiRoom, type Variant } from "@/lib/triqui";
import { SETTINGS, VARIANT_LABEL } from "./settings";

export default function TriquiHome() {
  const [variant, setVariant] = useState<Variant>("clasico");
  return (
    <GameLobby game="triqui">
      <OnlineTabs
        game="triqui"
        queue={`triqui-${variant}`}
        text="Te emparejamos al momento con alguien que también quiere jugar: partidas cortas, una revancha detrás de otra."
        extra={
          <div>
            <p className="mb-1.5 text-[13px] font-bold text-white/60">Modo</p>
            <div className="grid grid-cols-2 gap-2">
              {VARIANTS.map((v) => (
                <button key={v} onClick={() => setVariant(v)} className={`flex flex-col items-center ${chipClass(variant === v)}`}>
                  <span>{VARIANT_LABEL[v].label}</span>
                  <span className="text-[11px] font-normal opacity-70">{VARIANT_LABEL[v].sub}</span>
                </button>
              ))}
            </div>
          </div>
        }
        create={(hostId, vs) => createTriquiRoom(variant, hostId, vs)}
        friends={<CreateRoomForm settings={SETTINGS} />}
      />
    </GameLobby>
  );
}
