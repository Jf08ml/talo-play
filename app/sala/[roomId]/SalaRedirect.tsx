"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";
import { getRoomGame, roomPath } from "@/lib/games";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import { RoomLoading, RoomNotFound, RoomError } from "@/components/RoomStatus";

export default function SalaRedirect({ roomId }: { roomId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<"loading" | "not-found" | "error">("loading");

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    getRoomGame(roomId)
      .then((game) => {
        if (cancelled) return;
        if (game) router.replace(roomPath(game, roomId));
        else setStatus("not-found");
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [configured, roomId, router]);

  if (!configured) return <FirebaseSetupNotice />;

  return (
    <main className="flex h-dvh flex-col">
      {status === "loading" && <RoomLoading text="Buscando la sala…" />}
      {status === "not-found" && <RoomNotFound />}
      {status === "error" && <RoomError message="No pudimos buscar la sala. Probá de nuevo." />}
    </main>
  );
}
