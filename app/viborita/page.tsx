"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Trophy, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, segmentClass } from "@/components/ui";
import { enterOnline, getTop, onlineCount, type TopEntry } from "@/lib/vibora";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

type Mode = "online" | "amigos";

/** Two ways in: a public world that never ends, or a private room with friends. */
export default function ViboritaHome() {
  const [mode, setMode] = useState<Mode>("online");
  return (
    <GameLobby game="vibora">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
          <button onClick={() => setMode("online")} className={`flex items-center justify-center gap-1.5 ${segmentClass(mode === "online")}`}>
            <Globe className="h-4 w-4" /> Jugar en línea
          </button>
          <button onClick={() => setMode("amigos")} className={`flex items-center justify-center gap-1.5 ${segmentClass(mode === "amigos")}`}>
            <Users className="h-4 w-4" /> Solo con amigos
          </button>
        </div>
        {mode === "online" ? <OnlineCard /> : <CreateRoomForm settings={SETTINGS} />}
      </div>
    </GameLobby>
  );
}

function OnlineCard() {
  const router = useRouter();
  const [count, setCount] = useState<number | null>(null);
  const [top, setTop] = useState<TopEntry[]>([]);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onlineCount().then(setCount).catch(console.error);
    getTop().then(setTop).catch(console.error);
  }, []);

  const enter = async () => {
    setEntering(true);
    setError(null);
    try {
      const id = await enterOnline();
      trackEvent("create_room", { game: "vibora", mode: "online" });
      router.push(`/viborita/${id}`);
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Probá de nuevo.");
      setEntering(false);
    }
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-100">Un mapa con gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          No hay tiempo: crecé todo lo que puedas y llegá al primer puesto. Pero cuidado: si chocás contra la cabeza de otra víbora o
          contra el borde, perdés y tu cuerpo queda para que se lo coman los demás.
        </p>
      </div>
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 text-sm text-lime-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" /> {count} jugando ahora
        </p>
      )}
      {top.length > 0 && (
        <div className="rounded-xl bg-slate-950/50 p-3 ring-1 ring-amber-300/15">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-200/80">
            <Trophy className="h-3.5 w-3.5" /> Los más grandes de hoy
          </p>
          <ol className="flex flex-col gap-1 text-sm">
            {top.slice(0, 3).map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-slate-200">
                <span className="w-4 text-right text-slate-500">{i + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="font-mono">{e.best}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={enter} disabled={entering} className={PRIMARY_BUTTON}>
        {entering ? "Buscando un mapa…" : "Jugar en línea"}
      </button>
    </div>
  );
}
