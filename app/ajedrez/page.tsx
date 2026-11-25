"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createAjedrezRoom } from "@/lib/ajedrez";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import VsBotTabs from "@/components/VsBotTabs";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function AjedrezHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createAjedrezRoom(identity.clientId);
      trackEvent("create_room", { game: "ajedrez" });
      router.push(roomPath("ajedrez", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Prueba de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="ajedrez">
      <VsBotTabs
        game="ajedrez"
        text="Tú con las blancas y empiezas. En fácil se equivoca seguido; en difícil piensa varias jugadas y no regala piezas. En cada revancha se cambian los colores."
        create={(hostId, level) => createAjedrezRoom(hostId, level)}
        friends={
          <form
            onSubmit={handleCreate}
            className={`${CARD} flex flex-col gap-4`}
          >
            <h2 className="font-display text-lg font-semibold text-slate-100">
              Crear una sala nueva
            </h2>
            <p className="text-sm text-slate-400">
              No hay nada que configurar: crea la sala y mándale el link a tu
              rival. Si entra más gente, mira la partida y puede jugar la
              próxima.
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
