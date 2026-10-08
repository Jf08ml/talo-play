"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createRoom, type RoomMode } from "@/lib/puzzleRoom";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import ImageDropzone from "@/components/ImageDropzone";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass, segmentClass } from "@/components/ui";

const DIFFICULTIES = [
  { label: "Fácil", pieces: 24 },
  { label: "Media", pieces: 54 },
  { label: "Difícil", pieces: 96 },
  { label: "Experta", pieces: 168 },
];

export default function RompecabezasHome() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [pieceCount, setPieceCount] = useState(54);
  const [mode, setMode] = useState<RoomMode>("colab");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { roomId } = await createRoom({ file, pieceCount, mode });
      router.push(roomPath("rompecabezas", roomId));
    } catch (err) {
      console.error(err);
      setCreateError(
        err instanceof Error ? err.message : "No se pudo crear la sala. Probá de nuevo."
      );
      setCreating(false);
    }
  };

  return (
    <GameLobby game="rompecabezas">
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-800/60 p-1">
          <button type="button" onClick={() => setMode("colab")} className={segmentClass(mode === "colab")}>
            🤝 Colaborativo
          </button>
          <button type="button" onClick={() => setMode("versus")} className={segmentClass(mode === "versus")}>
            ⚔️ Competencia
          </button>
        </div>
        {mode === "versus" && (
          <p className="-mt-2 text-xs text-slate-400">
            Equipo Rojo 🔴 vs Equipo Azul 🔵, cada uno arma su propia copia del rompecabezas.
            ¡Gana el más rápido!
          </p>
        )}

        <ImageDropzone file={file} onChange={setFile} />

        <div>
          <p className={SECTION_LABEL}>Dificultad</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button
                type="button"
                key={d.label}
                onClick={() => setPieceCount(d.pieces)}
                className={chipClass(pieceCount === d.pieces)}
              >
                {d.label}
                <div className="text-[10px] font-normal text-slate-500">{d.pieces} piezas</div>
              </button>
            ))}
          </div>
        </div>

        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={!file || creating} className={`mt-1 ${PRIMARY_BUTTON}`}>
          {creating ? "Creando sala…" : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
