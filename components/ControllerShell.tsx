"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import FullscreenButton from "@/components/FullscreenButton";
import { GAMES, type GameId } from "@/lib/games";

/**
 * A phone used as the controller of a big-screen game: the pad takes the
 * whole screen (no room header, the page can't scroll), so its buttons have
 * room to spread. Every controller puts `ControllerActions` in its top row:
 * full screen (hides the browser's bars where it can) and «Salir».
 */
export default function ControllerShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col overflow-hidden bg-talo-ink text-white select-none [touch-action:none] ${className}`}
      style={{
        paddingTop: "max(8px, env(safe-area-inset-top))",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        paddingLeft: "max(8px, env(safe-area-inset-left))",
        paddingRight: "max(8px, env(safe-area-inset-right))",
      }}
    >
      {children}
    </div>
  );
}

/** Full screen and «Salir» (back to the game's lobby, after asking). */
export function ControllerActions({ game, className = "" }: { game: GameId; className?: string }) {
  const router = useRouter();
  const chip = "flex items-center gap-1.5 rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white/80 ring-1 ring-white/15 hover:bg-white/15";
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <FullscreenButton className={chip} iconClassName="h-4 w-4" />
      <button
        type="button"
        onClick={() => {
          if (window.confirm("¿Salir de la partida? La pantalla grande sigue sin ti.")) router.push(`/${GAMES[game].path}`);
        }}
        className={chip}
      >
        <LogOut className="h-4 w-4" /> Salir
      </button>
    </div>
  );
}
