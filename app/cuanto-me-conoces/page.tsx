"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function ConocesHome() {
  return (
    <GameLobby game="conoces">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
