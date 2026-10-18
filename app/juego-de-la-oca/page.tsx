"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function OcaHome() {
  return (
    <GameLobby game="oca">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
