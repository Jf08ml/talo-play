"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function TelefonoHome() {
  return (
    <GameLobby game="telefono">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
