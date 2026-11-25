"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Star, User, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, segmentClass } from "@/components/ui";
import SoloGame, { readProgress } from "@/components/gravedad/SoloGame";
import { LEVELS } from "@/lib/gravedadLevels";
import { enterOnline, onlineCount } from "@/lib/gravedadRoom";
import { roomPath } from "@/lib/games";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

type Tab = "solo" | "online" | "amigos";

/** Solo (the levels, right here), online races with anyone, or a room with friends. */
export default function GravedadHome() {
  const [tab, setTab] = useState<Tab>("solo");
  const [solo, setSolo] = useState(false);
  if (solo) return <SoloGame onExit={() => setSolo(false)} />;
  return (
    <GameLobby game="gravedad">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
          <button onClick={() => setTab("solo")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "solo")}`}>
            <User className="h-4 w-4" /> Solo
          </button>
          <button onClick={() => setTab("online")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "online")}`}>
            <Globe className="h-4 w-4" /> En línea
          </button>
          <button onClick={() => setTab("amigos")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "amigos")}`}>
            <Users className="h-4 w-4" /> Amigos
          </button>
        </div>
        {tab === "solo" && <SoloCard onStart={() => setSolo(true)} />}
        {tab === "online" && <OnlineCard />}
        {tab === "amigos" && <CreateRoomForm settings={SETTINGS} />}
      </div>
    </GameLobby>
  );
}

function SoloCard({ onStart }: { onStart: () => void }) {
  const [stars, setStars] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- progress lives in this browser: read after mounting.
    setStars(Object.values(readProgress()).reduce((s, p) => s + p.stars, 0));
  }, []);
  return (
    <div className={`${CARD} flex flex-col gap-3`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">{LEVELS.length} niveles</h2>
        <p className="mt-1 text-sm text-slate-400">
          Cada uno enseña un truco nuevo: caminar por el techo, por las paredes, flechas que cambian la gravedad, pisos que se rompen y plataformas que se mueven.
          Llega rápido para sacar tres estrellas.
        </p>
      </div>
      {stars > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-talo-hero">
          <Star className="h-4 w-4 fill-talo-hero" /> {stars} de {LEVELS.length * 3} estrellas
        </p>
      )}
      <button onClick={onStart} className={PRIMARY_BUTTON}>
        {stars > 0 ? "Seguir jugando" : "Empezar"}
      </button>
    </div>
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
      trackEvent("create_room", { game: "gravedad", mode: "online" });
      router.push(roomPath("gravedad", id));
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Prueba de nuevo.");
      setEntering(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Carreras contra gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          Una carrera detrás de otra: todos el mismo nivel a la vez, ves a los demás como fantasmas y gana el primero en llegar. Si llegas a mitad de una, entras en la
          siguiente.
        </p>
      </div>
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 text-sm text-lime-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" /> {count} jugando ahora
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={enter} disabled={entering} className={PRIMARY_BUTTON}>
        {entering ? "Buscando carrera…" : "Jugar en línea"}
      </button>
    </div>
  );
}
