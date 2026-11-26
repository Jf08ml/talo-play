"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, segmentClass } from "@/components/ui";
import { enterOnline, onlineCount } from "@/lib/arena";
import { roomPath } from "@/lib/games";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

type Tab = "online" | "amigos";

/** «En línea» (a public arena, battles one after another) or a room with friends (mode, map, team size, rounds, bots, events, healing, where it's seen). */
export default function ArenaLobby() {
  const [tab, setTab] = useState<Tab>("online");
  return (
    <GameLobby game="arena">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
          <button onClick={() => setTab("online")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "online")}`}>
            <Globe className="h-4 w-4" /> En línea
          </button>
          <button onClick={() => setTab("amigos")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "amigos")}`}>
            <Users className="h-4 w-4" /> Con amigos
          </button>
        </div>
        {tab === "online" ? <OnlineCard /> : <CreateRoomForm settings={SETTINGS} />}
      </div>
    </GameLobby>
  );
}

function OnlineCard() {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    onlineCount().then(setCount).catch(console.error);
  }, []);
  const enter = async () => {
    setEntering(true);
    setError(null);
    try {
      const id = await enterOnline();
      trackEvent("create_room", { game: "arena", mode: "online" });
      router.push(roomPath("arena", id));
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Prueba de nuevo.");
      setEntering(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Batallas con gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          Entras a una arena y peleas al toque: cada batalla es de equipos, todos contra todos o rey de la colina, en una arena al azar y con eventos. Las batallas van
          una detrás de otra; si llegas a mitad de una, miras y entras en la siguiente.
        </p>
      </div>
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 text-sm text-lime-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" /> {count} jugando ahora
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={enter} disabled={entering} className={PRIMARY_BUTTON}>
        {entering ? "Buscando arena…" : "Jugar en línea"}
      </button>
    </div>
  );
}
