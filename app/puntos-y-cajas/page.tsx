"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function CajasHome() {
  return (
    <GameLobby game="cajas">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
