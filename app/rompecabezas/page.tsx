"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isFirebaseConfigured } from "@/lib/firebase";
import { createRoom, type RoomMode } from "@/lib/room";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import ImageDropzone from "@/components/ImageDropzone";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";

const DIFFICULTIES = [
  { label: "Fácil", pieces: 24 },
  { label: "Media", pieces: 54 },
  { label: "Difícil", pieces: 96 },
  { label: "Experta", pieces: 168 },
];

export default function RompecabezasHome() {
  const identity = useClientIdentity();
  const router = useRouter();
  const configured = isFirebaseConfigured();

  const [nameInput, setNameInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pieceCount, setPieceCount] = useState(54);
  const [mode, setMode] = useState<RoomMode>("colab");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState("");

  if (!configured) return <FirebaseSetupNotice />;

  const name = identity.name;

  const handleSetName = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    identity.setName(trimmed.slice(0, 24));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { roomId } = await createRoom({ file, pieceCount, mode });
      router.push(`/sala/${roomId}`);
    } catch (err) {
      console.error(err);
      setCreateError(
        err instanceof Error ? err.message : "No se pudo crear la sala. Probá de nuevo."
      );
      setCreating(false);
    }
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/sala/${code}`);
  };

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-3xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-violet-300"
        >
          ← Salón de juegos
        </Link>

        <h1 className="animate-glow-pulse mx-auto flex w-fit items-center gap-2 rounded-2xl px-2 text-center font-display text-3xl font-bold tracking-tight sm:text-5xl">
          <span>🧩</span>
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            Rompecabezas Colaborativo
          </span>
        </h1>
        <p className="mt-3 text-center text-slate-400">
          Subí una imagen, convertila en un rompecabezas y armala en tiempo real con quien
          quieras, en una sala compartida.
        </p>

        {identity.clientId && !name && (
          <form
            onSubmit={handleSetName}
            className="mx-auto mt-8 flex max-w-sm gap-2 rounded-xl border border-violet-500/20 bg-slate-900/70 p-4 shadow-[0_0_30px_rgba(139,92,246,0.12)] backdrop-blur"
          >
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="¿Cómo te llamás?"
              maxLength={24}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 font-medium text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              Listo
            </button>
          </form>
        )}

        {name && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <form
              onSubmit={handleCreate}
              className="flex flex-col gap-4 rounded-2xl border border-violet-500/15 bg-slate-900/60 p-5 shadow-[0_0_25px_rgba(139,92,246,0.08)] backdrop-blur"
            >
              <h2 className="font-display text-lg font-semibold text-slate-100">
                Crear una sala nueva
              </h2>

              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-800/60 p-1">
                <button
                  type="button"
                  onClick={() => setMode("colab")}
                  className={`rounded-md py-1.5 text-sm font-medium transition ${
                    mode === "colab"
                      ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🤝 Colaborativo
                </button>
                <button
                  type="button"
                  onClick={() => setMode("versus")}
                  className={`rounded-md py-1.5 text-sm font-medium transition ${
                    mode === "versus"
                      ? "bg-violet-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  ⚔️ Competencia
                </button>
              </div>
              {mode === "versus" && (
                <p className="-mt-2 text-xs text-slate-400">
                  Equipo Rojo 🔴 vs Equipo Azul 🔵, cada uno arma su propia copia del
                  rompecabezas. ¡Gana el más rápido!
                </p>
              )}

              <ImageDropzone file={file} onChange={setFile} />

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Dificultad
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {DIFFICULTIES.map((d) => (
                    <button
                      type="button"
                      key={d.label}
                      onClick={() => setPieceCount(d.pieces)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                        pieceCount === d.pieces
                          ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                          : "border-slate-700 text-slate-400 hover:bg-slate-800/60"
                      }`}
                    >
                      {d.label}
                      <div className="text-[10px] font-normal text-slate-500">
                        {d.pieces} piezas
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {createError && <p className="text-sm text-red-400">{createError}</p>}

              <button
                type="submit"
                disabled={!file || creating}
                className="mt-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 py-2.5 font-medium text-white shadow-[0_0_20px_rgba(217,70,239,0.35)] transition hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {creating ? "Creando sala…" : "Crear sala"}
              </button>
            </form>

            <form
              onSubmit={handleJoin}
              className="flex flex-col gap-4 rounded-2xl border border-violet-500/15 bg-slate-900/60 p-5 shadow-[0_0_25px_rgba(139,92,246,0.08)] backdrop-blur"
            >
              <h2 className="font-display text-lg font-semibold text-slate-100">
                Unirse a una sala
              </h2>
              <p className="text-sm text-slate-400">
                Pedile el código de sala a quien te invitó (o abrí directamente el enlace
                que te compartió).
              </p>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Código de sala"
                maxLength={6}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-center font-mono text-lg tracking-widest text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              />
              <button
                type="submit"
                disabled={!joinCode.trim()}
                className="mt-auto rounded-lg border border-cyan-400/60 py-2.5 font-medium text-cyan-300 transition hover:bg-cyan-500/10 hover:shadow-[0_0_15px_rgba(34,211,238,0.25)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Unirme
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
