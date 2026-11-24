"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CalendarDays, Globe, User, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, chipClass, segmentClass } from "@/components/ui";
import type { SoloStart } from "@/components/minigolf/SoloGame";
import { readDay, readRecords } from "@/components/minigolf/progress";
import { DAILY_HOLES, DIFFICULTIES, type Difficulty } from "@/lib/minigolfHoles";
import { toPar } from "@/lib/minigolfSim";
import { enterOnline, getDaily, onlineCount, type DailyEntry } from "@/lib/minigolf";
import { statsDay } from "@/lib/dailyStats";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

const SoloGame = dynamic(() => import("@/components/minigolf/SoloGame"), { ssr: false });

type Tab = "solo" | "online" | "amigos";

/** Solo (a course or today's holes, right here), online with anyone, or a room with friends. */
export default function MinigolfHome() {
  const [tab, setTab] = useState<Tab>("solo");
  const [solo, setSolo] = useState<SoloStart | null>(null);
  if (solo) return <SoloGame start={solo} onExit={() => setSolo(null)} />;
  return (
    <GameLobby game="minigolf">
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
  const [difficulty, setDifficulty] = useState<Difficulty>("media");
  const [saved, setSaved] = useState<{ day: string; today: number | null; records: Partial<Record<Difficulty, number>> }>({ day: "", today: null, records: {} });
  const [top, setTop] = useState<DailyEntry[]>([]);
  useEffect(() => {
    const day = statsDay();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- progress lives in this browser: read after mounting.
    setSaved({ day, today: readDay(day), records: readRecords() });
    getDaily(day).then(setTop).catch(console.error);
  }, []);
  const record = saved.records[difficulty];

  return (
    <div className="flex flex-col gap-3">
      <div className={`${CARD} flex flex-col gap-3`}>
        <div>
          <h2 className="font-display text-lg text-slate-100">Recorrido de 9 hoyos</h2>
          <p className="mt-1 text-sm text-slate-400">Cada recorrido se inventa en el momento: pendientes, arena, agua, molinos y bumpers. Nunca vas a jugar dos iguales.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} onClick={() => setDifficulty(d.id)} className={chipClass(difficulty === d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        {record !== undefined && <p className="text-xs text-slate-400">Tu mejor recorrido aquí: {toPar(record, 0)} al par.</p>}
        <button onClick={() => onStart({ kind: "course", difficulty })} className={PRIMARY_BUTTON}>
          Jugar
        </button>
      </div>

      <div className={`${CARD} flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-talo-hero" />
          <h2 className="font-display text-lg text-slate-100">Hoyos del día</h2>
        </div>
        <p className="text-sm text-slate-400">
          Los mismos {DAILY_HOLES} hoyos para todos, nuevos cada día. Un solo intento: gana el de menos golpes (y si empatan, el más rápido).
        </p>
        {top.length > 0 && (
          <ol className="flex flex-col gap-1 text-sm">
            {top.slice(0, 3).map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-slate-200">
                <span className="w-4 text-right text-slate-500">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                <span className="flex-1 truncate">{e.name}</span>
                <span className="font-mono">{e.strokes} golpes</span>
              </li>
            ))}
          </ol>
        )}
        {saved.today === null ? (
          <button disabled={!saved.day} onClick={() => onStart({ kind: "daily", day: saved.day })} className={PRIMARY_BUTTON}>
            Jugar los hoyos de hoy
          </button>
        ) : (
          <p className="rounded-xl bg-white/[0.05] p-3 text-center text-sm text-slate-300">
            {saved.today > 0 ? `Hoy hiciste ${saved.today} golpes.` : "Hoy ya lo intentaste."} Mañana hay otros.
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
      trackEvent("create_room", { game: "minigolf", mode: "online" });
      router.push(`/minigolf/${id}`);
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Prueba de nuevo.");
      setEntering(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Recorridos con gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          Recorridos de 3 hoyos, uno atrás del otro. Todos juegan el mismo hoyo a la vez y ven las pelotas de los demás: gana el de menos golpes.
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
