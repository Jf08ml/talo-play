"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function ChinchonHome() {
  return (
    <GameLobby game="chinchon">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
