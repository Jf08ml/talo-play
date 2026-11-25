"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bot, Users } from "lucide-react";
import { BOT_LEVELS, BOT_LEVEL_LABEL, type BotLevel } from "@/lib/boardBot";
import { roomPath, type GameId } from "@/lib/games";
import { trackEvent } from "@/lib/analytics";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, chipClass, segmentClass } from "./ui";

const LEVEL_KEY = "talo.bot.nivel";

function readLevel(): BotLevel {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    return v === "facil" || v === "dificil" ? v : "normal";
  } catch {
    return "normal";
  }
}

/**
 * A one-on-one game's lobby: «Contra la app» (pick a level, play at once
 * against the computer) or «Con amigos» (`friends`, the usual create form).
 * `create` makes the room against the bot and returns its code.
 */
export default function VsBotTabs({
  game,
  text,
  extra,
  create,
  friends,
}: {
  game: GameId;
  text: string;
  /** More choices for the bot room (e.g. a game mode), above the level. */
  extra?: ReactNode;
  create: (hostId: string, level: BotLevel) => Promise<string>;
  friends: ReactNode;
}) {
  const router = useRouter();
  const identity = useClientIdentity();
  const [tab, setTab] = useState<"bot" | "amigos">("bot");
  const [level, setLevel] = useState<BotLevel>("normal");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the remembered level is only readable after mount
  useEffect(() => setLevel(readLevel()), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const play = async () => {
    if (!identity.clientId) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(LEVEL_KEY, level);
    } catch {}
    try {
      const id = await create(identity.clientId, level);
      trackEvent("create_room", { game, mode: "bot" });
      router.push(roomPath(game, id));
    } catch (err) {
      console.error(err);
      setError("No se pudo empezar. Prueba de nuevo.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900/80 p-1 ring-1 ring-slate-700/60">
        <button onClick={() => setTab("bot")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "bot")}`}>
          <Bot className="h-4 w-4" /> Contra la app
        </button>
        <button onClick={() => setTab("amigos")} className={`flex items-center justify-center gap-1.5 ${segmentClass(tab === "amigos")}`}>
          <Users className="h-4 w-4" /> Con amigos
        </button>
      </div>
      {tab === "amigos" ? (
        friends
      ) : (
        <div className={`${CARD} flex flex-col gap-4`}>
          <div>
            <h2 className="font-display text-lg text-slate-100">Tú contra la computadora</h2>
            <p className="mt-1 text-sm text-slate-400">{text}</p>
          </div>
          {extra}
          <div>
            <p className="mb-1.5 text-[13px] font-bold text-white/60">Nivel</p>
            <div className="grid grid-cols-3 gap-2">
              {BOT_LEVELS.map((l) => (
                <button key={l} onClick={() => setLevel(l)} className={`flex flex-col items-center ${chipClass(level === l)}`}>
                  <span>{BOT_LEVEL_LABEL[l].label}</span>
                  <span className="text-[11px] font-normal opacity-70">{BOT_LEVEL_LABEL[l].sub}</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button onClick={play} disabled={busy || !identity.clientId} className={PRIMARY_BUTTON}>
            {busy ? "Preparando el tablero…" : "Jugar"}
          </button>
        </div>
      )}
    </div>
  );
}
