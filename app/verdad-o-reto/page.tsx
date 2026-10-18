"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function RetoHome() {
  return (
    <GameLobby game="reto">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
