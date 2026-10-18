"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { GOAL_OPTIONS, MINUTE_OPTIONS, SIZE_OPTIONS, createFuegoRoom, type FuegoMode } from "@/lib/fuego";
import { MAPS, MAP_ORDER, type MapId } from "@/lib/fuegoMaps";
import type { BotLevel } from "@/lib/fuegoSim";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass, segmentClass } from "@/components/ui";
import { Bot } from "lucide-react";

const LEVELS: { id: BotLevel; label: string }[] = [
  { id: "facil", label: "Fáciles" },
  { id: "normal", label: "Normales" },
  { id: "dificil", label: "Difíciles" },
];

/** Create-room form: map, mode, how many fighters, kills to win, time and bots. */
export default function FuegoLobby() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [map, setMap] = useState<MapId>("bunker");
  const [mode, setMode] = useState<FuegoMode>("todos");
  const [size, setSize] = useState(4);
  const [goal, setGoal] = useState(20);
  const [minutes, setMinutes] = useState(10);
  const [bots, setBots] = useState(true);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createFuegoRoom(identity.clientId, { map, mode, size, goal, minutes, bots, level });
      trackEvent("create_room", { game: "fuego", mode });
      router.push(roomPath("fuego", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="fuego">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Mapa</p>
          <div className="flex flex-col gap-1.5">
            {MAP_ORDER.map((id) => {
              const m = MAPS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMap(id);
                    if (size > m.maxPlayers) setSize(m.maxPlayers);
                  }}
                  aria-pressed={map === id}
                  className={`${chipClass(map === id)} !px-3 !py-2 text-left`}
                >
                  <span className="text-sm">
                    {m.name} <span className="font-normal opacity-70">· {m.size}</span>
                  </span>
                  <span className="block font-normal opacity-70">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Modo</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/60 p-1">
            <button type="button" onClick={() => setMode("todos")} className={segmentClass(mode === "todos")}>
              Todos contra todos
            </button>
            <button type="button" onClick={() => setMode("equipos")} className={segmentClass(mode === "equipos")}>
              Rojos contra azules
            </button>
          </div>
        </div>

        <div>
          <p className={SECTION_LABEL}>Jugadores en total</p>
          <div className="grid grid-cols-4 gap-1.5">
            {SIZE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                disabled={n > MAPS[map].maxPlayers}
                className={`${chipClass(size === n)} disabled:opacity-30`}
              >
                {mode === "equipos" ? `${n / 2} vs ${n / 2}` : n}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={SECTION_LABEL}>Bajas para ganar</p>
            <div className="grid grid-cols-3 gap-1.5">
              {GOAL_OPTIONS.map((n) => (
                <button key={n} type="button" onClick={() => setGoal(n)} className={chipClass(goal === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={SECTION_LABEL}>Tiempo</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MINUTE_OPTIONS.map((n) => (
                <button key={n} type="button" onClick={() => setMinutes(n)} className={chipClass(minutes === n)}>
                  {n} min
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setBots((v) => !v)} aria-pressed={bots} className={`${chipClass(bots)} flex items-center gap-2 px-3 py-2.5 text-left text-sm`}>
            <Bot className="h-5 w-5 shrink-0" />
            <span className="flex-1">
              Completar con bots
              <span className="block text-xs font-normal text-slate-500">Los lugares libres los ocupan soldados de la compu. Sirve para practicar solo.</span>
            </span>
            <span className="font-semibold">{bots ? "Sí" : "No"}</span>
          </button>
          {bots && (
            <div className="grid grid-cols-3 gap-1.5">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" onClick={() => setLevel(l.id)} className={chipClass(level === l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
