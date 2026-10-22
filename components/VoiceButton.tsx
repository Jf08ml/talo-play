"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Headphones, Loader2, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import {
  VOICE_ENABLED,
  clearVoiceError,
  getVoiceServerState,
  getVoiceState,
  joinVoice,
  leaveVoice,
  silencePerson,
  startVoiceAudio,
  subscribeVoice,
  toggleMic,
} from "@/lib/voice";

function useVoice() {
  return useSyncExternalStore(subscribeVoice, getVoiceState, getVoiceServerState);
}

const PILL = "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold ring-1 transition active:scale-95";

/**
 * The room's voice chat in `RoomHeader`: "Voz" joins; once in, the mic toggle
 * (lit while you talk) and who's in, each one silenceable only for you.
 */
export default function VoiceButton({ roomId }: { roomId: string }) {
  const voice = useVoice();
  const { clientId, name } = useClientIdentity();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!voice.error) return;
    const t = setTimeout(clearVoiceError, 5000);
    return () => clearTimeout(t);
  }, [voice.error]);

  if (!VOICE_ENABLED || !clientId) return null;

  const here = voice.roomId === roomId && voice.status !== "off";
  const me = voice.people.find((p) => p.me);
  const others = voice.people.length - 1;

  return (
    <div ref={box} className="relative flex items-center gap-1">
      {!here && (
        <button
          onClick={() => joinVoice(roomId, clientId, name ?? "Jugador")}
          aria-label="Entrar a la voz"
          className={`${PILL} bg-emerald-500/10 text-emerald-200 ring-emerald-400/30 hover:bg-emerald-500/20`}
        >
          <Headphones className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Voz</span>
        </button>
      )}

      {here && voice.status === "connecting" && (
        <span className={`${PILL} bg-slate-800 text-slate-300 ring-slate-600/60`}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> <span className="hidden sm:inline">Conectando…</span>
        </span>
      )}

      {here && voice.status === "on" && (
        <>
          <button
            onClick={toggleMic}
            aria-label={voice.micOn ? "Silenciar micrófono" : "Activar micrófono"}
            aria-pressed={voice.micOn}
            className={`${PILL} ${
              !voice.micOn
                ? "bg-rose-500/15 text-rose-200 ring-rose-400/40"
                : me?.speaking
                  ? "bg-emerald-500/30 text-emerald-100 ring-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.6)]"
                  : "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40"
            }`}
          >
            {voice.micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Quién está en la voz"
            aria-expanded={open}
            className={`${PILL} bg-slate-800 text-slate-300 ring-slate-600/60 hover:bg-slate-700`}
          >
            <Headphones className="h-3.5 w-3.5" /> {others}
          </button>
        </>
      )}

      {here && voice.needsTap && (
        <button
          onClick={startVoiceAudio}
          className={`${PILL} animate-pulse bg-amber-500/20 text-amber-100 ring-amber-400/50`}
        >
          <Volume2 className="h-3.5 w-3.5" /> Tocá para escuchar
        </button>
      )}

      {voice.error && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-rose-500/30 bg-slate-900 px-3 py-2 text-xs text-rose-200 shadow-xl">
          {voice.error}
        </div>
      )}

      {open && here && voice.status === "on" && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-violet-500/20 bg-slate-900 p-2 shadow-xl">
          <p className="px-2 pb-1.5 pt-1 text-xs font-medium uppercase tracking-wide text-slate-500">En la voz</p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {voice.people.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-200">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    p.speaking && p.micOn ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-slate-600"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.me && <span className="text-slate-500"> (vos)</span>}
                </span>
                {!p.micOn && <MicOff className="h-3.5 w-3.5 text-slate-500" aria-label="Micrófono apagado" />}
                {!p.me && (
                  <button
                    onClick={() => silencePerson(p.id, !p.silenced)}
                    aria-label={p.silenced ? `Volver a escuchar a ${p.name}` : `Silenciar a ${p.name}`}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  >
                    {p.silenced ? <VolumeX className="h-3.5 w-3.5 text-rose-300" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {others === 0 && <p className="px-2 py-1 text-xs text-slate-500">Todavía no entró nadie más.</p>}
          <button
            onClick={() => {
              setOpen(false);
              leaveVoice();
            }}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/15 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25"
          >
            <PhoneOff className="h-4 w-4" /> Salir de la voz
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Mounted once in the root layout: leaves the voice when the page stops being
 * the room's (back to the home, another game…).
 */
export function VoiceKeeper() {
  const pathname = usePathname();
  const voice = useVoice();
  useEffect(() => {
    if (voice.roomId && voice.status !== "off" && !pathname.split("/").includes(voice.roomId)) leaveVoice();
  }, [pathname, voice.roomId, voice.status]);
  return null;
}
