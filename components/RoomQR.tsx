"use client";

import { useMemo, useSyncExternalStore } from "react";
import { encode } from "uqr";
import { roomPath, type GameId } from "@/lib/games";

const noSubscribe = () => () => {};

/**
 * A QR code with the room's link for the phones (the big screens' join card,
 * and a small one in their corner during the match): scanning it opens the
 * room on the phone, where only the name is left to type. Drawn here as SVG
 * (no service involved), dark on white with a margin so a TV across the room
 * still reads. Empty on the server, since the link needs this site's origin.
 */
export default function RoomQR({ game, roomId, className = "" }: { game: GameId; roomId: string; className?: string }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const url = origin ? `${origin}${roomPath(game, roomId)}` : "";
  const qr = useMemo(() => {
    if (!url) return null;
    // M: still reads with a glare or a smudge on the screen; border 2 = the quiet zone.
    const { data, size } = encode(url, { ecc: "M", border: 2 });
    let d = "";
    data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { d, size };
  }, [url]);
  return (
    <div className={`overflow-hidden rounded-xl bg-white ${className}`} role="img" aria-label="Código QR para entrar a la sala desde el celular">
      {qr && (
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="block h-full w-full" shapeRendering="crispEdges" aria-hidden>
          <path d={qr.d} fill="#111111" />
        </svg>
      )}
    </div>
  );
}
