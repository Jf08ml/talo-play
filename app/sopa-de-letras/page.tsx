"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, createSopaRoom, type SopaLevel } from "@/lib/sopa";
import { SOPA_THEME_OPTIONS, type SopaTheme } from "@/lib/sopaWords";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

const LEVEL_IDS = Object.keys(LEVELS) as SopaLevel[];

export default function SopaHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [theme, setTheme] = useState<SopaTheme>("mezcla");
  const [level, setLevel] = useState<SopaLevel>("normal");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createSopaRoom({ theme, level }, identity.clientId);
      trackEvent("create_room", { game: "sopa" });
      router.push(roomPath("sopa", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="sopa">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Tema</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SOPA_THEME_OPTIONS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTheme(t.id)} className={chipClass(theme === t.id)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Dificultad</p>
          <div className="grid grid-cols-3 gap-1.5">
            {LEVEL_IDS.map((id) => (
              <button key={id} type="button" onClick={() => setLevel(id)} className={chipClass(level === id)}>
                {LEVELS[id].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {LEVELS[level].words} palabras · {LEVELS[level].hint}
          </p>
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
