"use client";

import { trackEvent } from "@/lib/analytics";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CLUE_ROUND_OPTIONS, createImpostorRoom, type ClueMode } from "@/lib/impostor";
import { IMPOSTOR_CATEGORIES, type ImpostorCategory } from "@/lib/impostorWords";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass, segmentClass } from "@/components/ui";

export default function ImpostorHome() {
  const router = useRouter();
  const identity = useClientIdentity();
  const [clueMode, setClueMode] = useState<ClueMode>("app");
  const [clueRounds, setClueRounds] = useState<number>(2);
  const [impostorHint, setImpostorHint] = useState(true);
  const [categories, setCategories] = useState<ImpostorCategory[]>(IMPOSTOR_CATEGORIES.map((c) => c.id));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const toggle = (id: ImpostorCategory) =>
    setCategories((cs) => (cs.includes(id) ? cs.filter((c) => c !== id) : [...cs, id]));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (categories.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createImpostorRoom({ categories, clueMode, clueRounds, impostorHint }, identity.clientId);
      trackEvent("create_room", { game: "impostor" });
      router.push(roomPath("impostor", roomId));
    } catch (err) {
      console.error(err);
      setCreateError("No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby game="impostor">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>¿Dónde dan las pistas?</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950/60 p-1">
            <button type="button" onClick={() => setClueMode("app")} className={segmentClass(clueMode === "app")}>
              En la app
            </button>
            <button type="button" onClick={() => setClueMode("voz")} className={segmentClass(clueMode === "voz")}>
              En voz alta
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {clueMode === "app"
              ? "Por turnos, cada uno escribe su pista. Ideal a distancia."
              : "Están juntos: la app reparte las cartas y organiza la votación."}
          </p>
        </div>

        {clueMode === "app" && (
          <div>
            <p className={SECTION_LABEL}>Vueltas de pistas antes de votar</p>
            <div className="grid grid-cols-3 gap-1.5">
              {CLUE_ROUND_OPTIONS.map((n) => (
                <button key={n} type="button" onClick={() => setClueRounds(n)} className={chipClass(clueRounds === n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className={SECTION_LABEL}>Categorías</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {IMPOSTOR_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                aria-pressed={categories.includes(c.id)}
                className={chipClass(categories.includes(c.id))}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          {categories.length === 0 && <p className="mt-1.5 text-xs text-amber-300">Elegí al menos una categoría.</p>}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={impostorHint}
            onChange={(e) => setImpostorHint(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
          El impostor sabe la categoría (más fácil para él)
        </label>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || categories.length === 0} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
