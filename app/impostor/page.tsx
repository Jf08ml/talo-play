"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function ImpostorHome() {
  return (
    <GameLobby game="impostor">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
