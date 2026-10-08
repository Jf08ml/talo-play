"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDeslizRoom, SIZES } from "@/lib/deslizante";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import ImageDropzone from "@/components/ImageDropzone";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass } from "@/components/ui";

export default function DeslizanteHome() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<number>(4);
  const [showNumbers, setShowNumbers] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await createDeslizRoom({ file, size, showNumbers });
      router.push(roomPath("deslizante", roomId));
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof Error ? err.message : "No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby
      game="deslizante"
      description="Las fichas están mezcladas y falta una: deslizalas por el hueco hasta rearmar la imagen. Todos reciben la misma mezcla y gana el primero que lo ordena."
    >
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <ImageDropzone file={file} onChange={setFile} />

        <div>
          <p className={SECTION_LABEL}>Tamaño</p>
          <div className="grid grid-cols-3 gap-1.5">
            {SIZES.map((s) => (
              <button key={s.size} type="button" onClick={() => setSize(s.size)} className={chipClass(size === s.size)}>
                {s.label}
                <div className="text-[10px] font-normal text-slate-500">
                  {s.size}×{s.size}
                </div>
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={showNumbers}
            onChange={(e) => setShowNumbers(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
          Mostrar números en las fichas (ayuda)
        </label>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={!file || creating} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
