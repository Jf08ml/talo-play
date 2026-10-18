"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function LoboHome() {
  return (
    <GameLobby game="lobo">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
