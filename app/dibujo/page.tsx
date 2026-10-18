"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function DibujoHome() {
  return (
    <GameLobby game="dibujo">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
