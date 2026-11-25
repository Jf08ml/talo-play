"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createOteloRoom } from "@/lib/otelo";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import OnlineTabs from "@/components/OnlineTabs";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function OteloHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createOteloRoom(identity.clientId);
      trackEvent("create_room", { game: "otelo" });
      router.push(roomPath("otelo", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Prueba de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="otelo">
      <OnlineTabs
        game="otelo"
        text="Te emparejamos al momento con alguien que también quiere jugar. Los colores se sortean y en cada revancha se cambian."
        create={(hostId, vs) => createOteloRoom(hostId, vs)}
        friends={
          <form
            onSubmit={handleCreate}
            className={`${CARD} flex flex-col gap-4`}
          >
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Crear una sala nueva
            </h2>
            <p className="text-sm text-slate-400">
              Tablero de 8 × 8 con las reglas de siempre. La app te marca dónde
              puedes jugar y da vuelta las fichas sola. Crea la sala y mándale
              el link a tu rival.
            </p>
            {createError && (
              <p className="text-sm text-red-400">{createError}</p>
            )}
            <button
              type="submit"
              disabled={creating}
              className={`mt-auto ${PRIMARY_BUTTON}`}
            >
              {creating ? "Creando sala…" : "Crear sala"}
            </button>
          </form>
        }
      />
    </GameLobby>
  );
}
