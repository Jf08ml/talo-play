"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function DeslizanteHome() {
  return (
    <GameLobby game="deslizante">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
