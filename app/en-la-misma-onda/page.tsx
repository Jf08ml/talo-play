"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function OndaHome() {
  return (
    <GameLobby game="onda">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
