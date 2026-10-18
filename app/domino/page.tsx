"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function DominoHome() {
  return (
    <GameLobby game="domino">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
