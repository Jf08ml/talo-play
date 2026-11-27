"use client";

import { useMemo } from "react";
import type { CarrerasGame } from "@/lib/carreras";
import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { carrerasSettings } from "./settings";
import CarCard from "./CarCard";

/** Create-room form for both racing games (only 3D can run on the phones alone), with «Tu auto» in 3D. */
export default function CarrerasLobby({ game }: { game: CarrerasGame }) {
  const settings = useMemo(() => carrerasSettings(game), [game]);
  return (
    <GameLobby game={game}>
      <div className="flex flex-col gap-3">
        {game === "carreras3d" && <CarCard />}
        <CreateRoomForm settings={settings} />
      </div>
    </GameLobby>
  );
}
