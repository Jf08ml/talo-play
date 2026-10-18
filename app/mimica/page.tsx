"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function MimicaHome() {
  return (
    <GameLobby game="mimica">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
