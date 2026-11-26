"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function QuienSoyHome() {
  return (
    <GameLobby game="quiensoy">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
