"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCodigoRoom } from "@/lib/codigo";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { CARD, PRIMARY_BUTTON } from "@/components/ui";

export default function CodigoHome() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createCodigoRoom();
      router.push(roomPath("codigo", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby
      game="codigo"
      description="Dos equipos, 25 palabras. Los jefes de espías conocen el mapa secreto y dan pistas de una palabra para que su equipo encuentre sus agentes… sin tocar la bomba."
    >
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>
        <ul className="flex flex-col gap-1.5 text-sm text-slate-400">
          <li>🔴🔵 Equipo Rojo contra Equipo Azul, mínimo 4 jugadores.</li>
          <li>🕵️ Cada equipo tiene un jefe de espías que ve de qué color es cada palabra.</li>
          <li>💬 El jefe da una pista: una palabra y un número.</li>
          <li>👆 Su equipo toca las palabras que cree que son suyas.</li>
          <li>💣 Si tocan la bomba, pierden.</li>
        </ul>
        {createError && <p className="text-sm text-red-400">{createError}</p>}
        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
