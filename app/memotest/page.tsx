"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createMemotestRoom, MEMO_SIZES } from "@/lib/memotest";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function MemotestHome() {
  const router = useRouter();
  const [pairs, setPairs] = useState<number>(MEMO_SIZES[0].pairs);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createMemotestRoom(pairs);
      router.push(roomPath("memotest", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby
      game="memotest"
      description="Dá vuelta las cartas de a dos y encontrá los pares. Por turnos: si acertás, seguís jugando. Gana quien junte más pares."
    >
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tamaño del tablero</p>
          <div className="grid grid-cols-3 gap-1.5">
            {MEMO_SIZES.map((s) => (
              <button
                type="button"
                key={s.label}
                onClick={() => setPairs(s.pairs)}
                className={chipClass(pairs === s.pairs)}
              >
                {s.label}
                <div className="text-[10px] font-normal text-slate-500">{s.pairs} pares</div>
              </button>
            ))}
          </div>
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
