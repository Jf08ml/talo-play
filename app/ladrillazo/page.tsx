"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Infinity as InfinityIcon, Lock, User, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, segmentClass } from "@/components/ui";
import SoloGame, { type SoloStart } from "@/components/ladrillazo/SoloGame";
import { Stars } from "@/components/ladrillazo/Hud";
import { readRecord, readStars, unlockedUpTo } from "@/components/ladrillazo/progress";
import { CAMPAIGN } from "@/lib/ladrillazoLevels";
import { enterOnline, onlineCount } from "@/lib/ladrillazo";
import { trackEvent } from "@/lib/analytics";
import { SETTINGS } from "./settings";

type Tab = "solo" | "online" | "amigos";

/** Three ways in: solo (campaign or infinite, right here), online with anyone, or a room with friends. */
export default function LadrillazoHome() {
  const [tab, setTab] = useState<Tab>("solo");
  const [solo, setSolo] = useState<SoloStart | null>(null);
  if (solo) return <SoloGame start={solo} onExit={() => setSolo(null)} />;
  return (
    <GameLobby game="ladrillazo">
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
  const [stars, setStars] = useState<number[]>([]);
  const [record, setRecord] = useState(0);
  useEffect(() => {
    // Progress lives in this browser only.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mounting (no localStorage on the server).
    setStars(readStars());
    setRecord(readRecord());
  }, []);
  const open = unlockedUpTo(stars);
  const total = stars.reduce((a, b) => a + b, 0);

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-slate-100">Niveles</h2>
          <p className="text-sm text-slate-400">Pasá uno para abrir el siguiente. Hasta tres estrellas por nivel.</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-slate-300">
          {total}/{CAMPAIGN.length * 3} ★
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {CAMPAIGN.map((level, i) => {
          const locked = i > open;
          return (
            <button
              key={i}
              disabled={locked}
              onClick={() => onStart({ kind: "campaign", index: i })}
              title={level.name}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10"
            >
              {locked ? <Lock className="h-4 w-4 text-white/60" /> : <span className="font-display text-xl text-white">{i + 1}</span>}
              {!locked && <Stars n={stars[i] ?? 0} size="h-3 w-3" />}
            </button>
          );
        })}
      </div>
      <button onClick={() => onStart({ kind: "campaign", index: open })} className={PRIMARY_BUTTON}>
        {total ? `Seguir: nivel ${open + 1}` : "Empezar"}
      </button>
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
        <InfinityIcon className="h-6 w-6 shrink-0 text-talo-hero" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-100">Infinito</p>
          <p className="text-xs text-slate-400">Niveles nuevos sin fin, cada vez más difíciles.{record > 0 && ` Tu récord: ${record}.`}</p>
        </div>
        <button onClick={() => onStart({ kind: "infinite" })} className="rounded-[10px] border-2 border-white/70 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/10">
          Jugar
        </button>
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
      trackEvent("create_room", { game: "ladrillazo", mode: "online" });
      router.push(`/ladrillazo/${id}`);
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Probá de nuevo.");
      setEntering(false);
    }
  };

  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Contra gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">
          Rondas cortas, una atrás de la otra: carreras en el mismo nivel y, cada tanto, un ataque donde los combos le tiran ladrillos a los demás. Si
          no hay nadie, completan unos bots.
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
