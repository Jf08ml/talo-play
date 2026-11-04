"use client";

import { useEffect, useState } from "react";
import { Ban, RotateCcw, Undo2 } from "lucide-react";
import { cross, isSolved, isStuck, newPlay, startAt, totalCrossings, tricksOf, undo, type Play, type Puzzle } from "@/lib/puentes";
import { installUnlock, playSound } from "@/lib/sfx";
import Board from "./Board";

/**
 * One map being played: the board, what's special about it, undo / start
 * over and, when the map may have no route, "No se puede". Remount it (key)
 * for a new map.
 */
export default function PlayArea({
  pz,
  disabled = false,
  canClaim,
  onSolved,
  onClaim,
  onProgress,
  onMistake,
}: {
  pz: Puzzle;
  disabled?: boolean;
  /** Show "No se puede" (levels where maps can be impossible). */
  canClaim: boolean;
  onSolved: () => void;
  onClaim: () => void;
  /** Bridges crossed so far (for the rivals' bars). */
  onProgress?: (crossed: number) => void;
  /** Undo, start over (for the stars). */
  onMistake?: () => void;
}) {
  const [play, setPlay] = useState<Play>(() => newPlay(pz));
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const total = totalCrossings(pz);
  const stuck = isStuck(pz, play);
  const allCrossed = play.path.length === total;

  useEffect(installUnlock, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(t);
  }, [note]);
  useEffect(() => {
    if (stuck) playSound("bad");
  }, [stuck]);

  const say = (text: string) => setNote({ text, key: Date.now() });

  const update = (next: Play) => {
    setPlay(next);
    onProgress?.(next.path.length);
    if (isSolved(pz, next)) onSolved();
  };

  const tapCell = (cell: number) => {
    if (disabled || play.cell >= 0) return;
    const p = startAt(pz, cell);
    if (!p) {
      playSound("bad");
      say("Tenés que salir de la isla con la bandera verde");
      return;
    }
    playSound("flip");
    update(p);
  };

  const tapBridge = (i: number) => {
    if (disabled) return;
    if (play.cell < 0) {
      say("Primero tocá la isla donde querés empezar");
      return;
    }
    const next = cross(pz, play, i);
    if (!next) {
      playSound("bad");
      const br = pz.bridges[i];
      const here = pz.cells[play.cell];
      const touches = pz.cells[br.a] === here || pz.cells[br.b] === here;
      say(
        play.counts[i] >= br.times
          ? "Ese puente ya lo cruzaste"
          : !touches
            ? "Ese puente no sale de la isla donde estás"
            : "Ese puente es de una mano: se cruza para el otro lado"
      );
      return;
    }
    playSound("place");
    update(next);
  };

  const tricks = tricksOf(pz);

  return (
    <div className="flex flex-col gap-2">
      {tricks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {tricks.map((t) => (
            <li key={t} className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[12px] leading-snug text-white/80">
              {t}
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Board pz={pz} play={play} onCell={tapCell} onBridge={tapBridge} />
        {note && (
          <p key={note.key} className="animate-celebration-in pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-black/75 px-3 py-1.5 text-center text-xs font-bold text-white">
            {note.text}
          </p>
        )}
        {play.cell < 0 && !disabled && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-black/70 px-3 py-1.5 text-center text-xs font-bold text-white">
            {pz.start >= 0 ? "Tocá la isla de la bandera verde para empezar" : "Tocá la isla donde querés empezar"}
          </p>
        )}
        {stuck && !disabled && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-[#FF3B30]/90 px-3 py-1.5 text-center text-xs font-bold text-white">
            {allCrossed ? "Cruzaste todo, pero tenías que terminar en la bandera a cuadros" : "Te trabaste: no queda ningún puente para cruzar desde acá"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="mr-auto text-sm text-white/70">
          <span className="font-mono font-bold text-white">{play.path.length}</span>/{total} cruces
        </span>
        <button
          disabled={disabled || !play.path.length}
          onClick={() => {
            onMistake?.();
            update(undo(pz, play));
          }}
          className="flex items-center gap-1 rounded-[10px] border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:border-white/40 disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Deshacer
        </button>
        <button
          disabled={disabled || play.cell < 0}
          onClick={() => {
            onMistake?.();
            update(newPlay(pz));
          }}
          className="flex items-center gap-1 rounded-[10px] border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white/80 hover:border-white/40 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" /> De nuevo
        </button>
      </div>
      {canClaim && (
        <button
          disabled={disabled}
          onClick={onClaim}
          className="flex items-center justify-center gap-1.5 rounded-[14px] border-2 border-[#FF3B30]/70 py-2 text-sm font-bold text-[#ff8a80] hover:bg-[#FF3B30]/10 disabled:opacity-40"
        >
          <Ban className="h-4 w-4" /> No se puede
        </button>
      )}
    </div>
  );
}
