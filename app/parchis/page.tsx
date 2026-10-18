"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function LudoHome() {
  return (
    <GameLobby game="ludo">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
