"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Bot, ChevronRight, Globe, GraduationCap, Users } from "lucide-react";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { CARD, PRIMARY_BUTTON, chipClass, segmentClass } from "@/components/ui";
import { createTroncoRoom, enterOnline, onlineCount, type Pace } from "@/lib/troncoRoom";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { trackEvent } from "@/lib/analytics";
import { PACE_OPTIONS, SETTINGS } from "./settings";
import { PRACTICED_KEY } from "@/lib/tronco";

const TroncoPractice = dynamic(() => import("@/components/tronco/Practice"), { ssr: false });

type Tab = "bots" | "online" | "amigos";

// Read on every render (closing the practice re-renders the lobby); no events to follow.
const noSubscribe = () => () => {};
function readPracticed(): boolean {
  try {
    return localStorage.getItem(PRACTICED_KEY) === "1";
  } catch {
    return true;
  }
}

export default function TroncoHome() {
  const [tab, setTab] = useState<Tab>("bots");
  const [practice, setPractice] = useState(false);
  const practiced = useSyncExternalStore(noSubscribe, readPracticed, () => true);
  const startBots = useStartBots();
  return (
    <GameLobby game="tronco">
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setPractice(true)}
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${practiced ? "bg-white/[0.06] text-white hover:bg-white/10" : "bg-talo-hero text-talo-ink hover:brightness-95"}`}
        >
          <GraduationCap className="h-6 w-6 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{practiced ? "Practicar" : "¿Primera vez? Practicá un minuto"}</span>
            <span className={`block text-xs ${practiced ? "text-white/60" : "text-talo-ink/70"}`}>Te enseña cuándo saltar y cuándo patear, sin quedar afuera.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </button>
        {practice && (
          <TroncoPractice
            onClose={() => setPractice(false)}
            onPlay={() => {
              setPractice(false);
              startBots(5, "normal");
            }}
          />
        )}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
          <button onClick={() => setTab("bots")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "bots")}`}>
            <Bot className="h-4 w-4" /> Contra bots
          </button>
          <button onClick={() => setTab("online")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "online")}`}>
            <Globe className="h-4 w-4" /> En línea
          </button>
          <button onClick={() => setTab("amigos")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "amigos")}`}>
            <Users className="h-4 w-4" /> Amigos
          </button>
        </div>
        {tab === "bots" && <BotsCard />}
        {tab === "online" && <OnlineCard />}
        {tab === "amigos" && <CreateRoomForm settings={SETTINGS} />}
      </div>
    </GameLobby>
  );
}

/** Creates a "Contra bots" room and goes there; false if it failed. */
function useStartBots() {
  const router = useRouter();
  const identity = useClientIdentity();
  return async (bots: number, pace: Pace): Promise<boolean> => {
    if (!identity.clientId) return false;
    try {
      const id = await createTroncoRoom(identity.clientId, { bots, pace, view: "telefono" }, true);
      trackEvent("create_room", { game: "tronco", mode: "bots" });
      router.push(`/el-tronco/${id}`);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };
}

function BotsCard() {
  const identity = useClientIdentity();
  const startBots = useStartBots();
  const [bots, setBots] = useState(5);
  const [pace, setPace] = useState<Pace>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    if (!(await startBots(bots, pace))) {
      setError("No se pudo empezar. Probá de nuevo.");
      setBusy(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Vos contra la compu</h2>
        <p className="mt-1 text-sm text-slate-400">Una ronda de talos y un tronco que no para. Aguantá hasta ser el último parado.</p>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-bold text-white/60">Rivales</p>
        <div className="grid grid-cols-3 gap-2">
          {[3, 5, 7].map((n) => (
            <button key={n} onClick={() => setBots(n)} className={chipClass(bots === n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-[13px] font-bold text-white/60">Velocidad</p>
        <div className="grid grid-cols-2 gap-2">
          {PACE_OPTIONS.map((o) => (
            <button key={o.value} onClick={() => setPace(o.value as Pace)} className={chipClass(pace === o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={go} disabled={busy || !identity.clientId} className={PRIMARY_BUTTON}>
        {busy ? "Armando la ronda…" : "Jugar"}
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
      trackEvent("create_room", { game: "tronco", mode: "online" });
      router.push(`/el-tronco/${id}`);
    } catch (err) {
      console.error(err);
      setError("No se pudo entrar. Probá de nuevo.");
      setEntering(false);
    }
  };
  return (
    <div className={`${CARD} flex flex-col gap-4`}>
      <div>
        <h2 className="font-display text-lg text-slate-100">Una ronda con gente de todos lados</h2>
        <p className="mt-1 text-sm text-slate-400">Partidas cortas, una atrás de la otra. Si llegás en medio de una, mirás y entrás en la siguiente. Si hay poca gente, completan unos bots.</p>
      </div>
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 text-sm text-lime-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" /> {count} jugando ahora
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button onClick={enter} disabled={entering} className={PRIMARY_BUTTON}>
        {entering ? "Buscando ronda…" : "Jugar en línea"}
      </button>
    </div>
  );
}
