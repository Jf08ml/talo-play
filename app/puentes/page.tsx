"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Globe, User, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, segmentClass } from "@/components/ui";
import SoloGame, { type SoloStart } from "@/components/puentes/SoloGame";
import { readDay, readLevel } from "@/components/puentes/progress";
import { formatTime } from "@/components/ladrillazo/Hud";
import { dayKey } from "@/lib/puentes";
import { enterOnline, getDaily, onlineCount, type DailyEntry } from "@/lib/puentesRoom";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

type Tab = "solo" | "online" | "amigos";

/** Solo (endless levels and the daily challenge, right here), online with anyone, or a room with friends. */
export default function PuentesHome() {
  const [tab, setTab] = useState<Tab>("solo");
  const [solo, setSolo] = useState<SoloStart | null>(null);
  if (solo) return <SoloGame start={solo} onExit={() => setSolo(null)} />;
  return (
    <GameLobby game="puentes">
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
        {tab === "solo" && <SoloCard onStart={setSolo} />}
        {tab === "online" && <OnlineCard />}
        {tab === "amigos" && <CreateRoomForm settings={SETTINGS} />}
      </div>
    </GameLobby>
  );
}

function SoloCard({ onStart }: { onStart: (s: SoloStart) => void }) {
  const [saved, setSaved] = useState<{ level: number; day: string; today: number | null }>({ level: 1, day: "", today: null });
  const [top, setTop] = useState<DailyEntry[]>([]);
  useEffect(() => {
    const day = dayKey(Date.now());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- progress lives in this browser: read after mounting.
    setSaved({ level: readLevel(), day, today: readDay(day) });
    getDaily(day).then(setTop).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-col gap-3`}>
        <div>
          <h2 className="font-display text-lg text-slate-100">Niveles sin fin</h2>
          <p className="mt-1 text-sm text-slate-400">
            Cada mapa se inventa en el momento: nunca vas a ver dos iguales. A medida que subís aparecen puentes de una mano, puentes dobles y mapas que no
            tienen solución.
          </p>
        </div>
        <button onClick={() => onStart({ kind: "levels", level: saved.level })} className={PRIMARY_BUTTON}>
          {saved.level > 1 ? `Seguir en el nivel ${saved.level}` : "Empezar"}
        </button>
        {saved.level > 1 && (
          <button onClick={() => onStart({ kind: "levels", level: 1 })} className="text-xs text-white/50 hover:text-white">
            Empezar desde el nivel 1
          </button>
        )}
      </div>

      <div className={`${CARD} flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-talo-hero" />
          <h2 className="font-display text-lg text-slate-100">Reto del día</h2>
        </div>
        <p className="text-sm text-slate-400">El mismo mapa para todos, uno nuevo cada día. Tenés un solo intento: gana el más rápido.</p>
        {top.length > 0 && (
          <ol className="flex flex-col gap-1 text-sm">
            {top.slice(0, 3).map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-slate-200">
                <span className="w-4 text-right text-slate-500">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="font-mono">{formatTime(e.ms / 1000)}</span>
              </li>
            ))}
          </ol>
        )}
        {saved.today === null ? (
          <button disabled={!saved.day} onClick={() => onStart({ kind: "daily", day: saved.day })} className={PRIMARY_BUTTON}>
            Jugar el reto de hoy
          </button>
        ) : (
          <p className="rounded-xl bg-white/[0.05] p-3 text-center text-sm text-slate-300">
            {saved.today >= 0 ? `Hoy lo resolviste en ${formatTime(saved.today / 1000)}.` : saved.today === -1 ? "Hoy no te salió." : "Hoy ya lo intentaste."} Mañana hay
            otro.
          </p>
        )}
      </div>
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
      trackEvent("create_room", { game: "puentes", mode: "online" });
      router.push(`/puentes/${id}`);
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Probá de nuevo.");
      setEntering(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Carreras contra gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          Rondas cortas, una atrás de la otra: todos reciben el mismo mapa y gana el primero que cruza todos los puentes (o el que se da cuenta de que no se puede).
        </p>
      </div>
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 text-sm text-lime-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" /> {count} jugando ahora
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={enter} disabled={entering} className={PRIMARY_BUTTON}>
        {entering ? "Buscando partida…" : "Jugar en línea"}
      </button>
    </div>
  );
}
