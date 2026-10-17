"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SIZE_OPTIONS, WINS_OPTIONS, createArenaRoom } from "@/lib/arena";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";
import { Bot } from "lucide-react";

/** Create-room form: team size, how many rounds, and bots to fill the places. */
export default function ArenaLobby() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [size, setSize] = useState(1);
  const [wins, setWins] = useState(2);
  const [bots, setBots] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createArenaRoom(identity.clientId, { size, wins, bots });
      router.push(roomPath("arena", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="arena">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Combate</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZE_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setSize(n)} className={`${chipClass(size === n)} py-2 text-sm`}>
                {n} contra {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Rondas</p>
          <div className="grid grid-cols-2 gap-1.5">
            {WINS_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setWins(n)} className={chipClass(wins === n)}>
                Al mejor de {n * 2 - 1}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setBots((b) => !b)}
          className={`${chipClass(bots)} flex items-center gap-2 px-3 py-2.5 text-left text-sm`}
          aria-pressed={bots}
        >
          <Bot className="h-5 w-5 shrink-0" />
          <span className="flex-1">
            Completar con bots
            <span className="block text-xs font-normal text-slate-500">
              Los lugares vacíos los ocupan caballeros de la compu. Sirve para practicar solo.
            </span>
          </span>
          <span className="font-semibold">{bots ? "Sí" : "No"}</span>
        </button>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
