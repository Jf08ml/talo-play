"use client";

import { useMemo } from "react";
import type { CarrerasGame } from "@/lib/carreras";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { carrerasSettings } from "./settings";

/** Create-room form for both racing games; only 3D can run on the phones alone. */
export default function CarrerasLobby({ game }: { game: CarrerasGame }) {
  const settings = useMemo(() => carrerasSettings(game), [game]);
  return (
    <GameLobby game={game}>
      <CreateRoomForm settings={settings} />
    </GameLobby>
  );
}
