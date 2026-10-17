"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SIZE_OPTIONS, WINS_OPTIONS, createArenaRoom } from "@/lib/arena";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";
import { Bot, FlaskConical, HeartPulse, type LucideIcon } from "lucide-react";

/** Create-room form: team size, how many rounds, bots to fill the places and how health comes back. */
export default function ArenaLobby() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [size, setSize] = useState(1);
  const [wins, setWins] = useState(2);
  const [bots, setBots] = useState(true);
  const [potions, setPotions] = useState(true);
  const [regen, setRegen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createArenaRoom(identity.clientId, { size, wins, bots, potions, regen });
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

        <div className="flex flex-col gap-1.5">
          <Toggle
            on={bots}
            set={setBots}
            icon={Bot}
            label="Completar con bots"
            hint="Los lugares vacíos los ocupan caballeros de la compu. Sirve para practicar solo."
          />
          <Toggle
            on={potions}
            set={setPotions}
            icon={FlaskConical}
            label="Pociones en la arena"
            hint="Curan 40 de vida y vuelven a aparecer al rato en su lugar."
          />
          <Toggle
            on={regen}
            set={setRegen}
            icon={HeartPulse}
            label="Regenerar vida"
            hint="Si nadie te pega por unos segundos, la vida se recupera de a poco."
          />
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}

function Toggle({
  on,
  set,
  icon: Icon,
  label,
  hint,
}: {
  on: boolean;
  set: (fn: (v: boolean) => boolean) => void;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => set((v) => !v)}
      className={`${chipClass(on)} flex items-center gap-2 px-3 py-2.5 text-left text-sm`}
      aria-pressed={on}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="flex-1">
        {label}
        <span className="block text-xs font-normal text-slate-500">{hint}</span>
      </span>
      <span className="font-semibold">{on ? "Sí" : "No"}</span>
    </button>
  );
}
