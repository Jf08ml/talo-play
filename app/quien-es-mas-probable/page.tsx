"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function ProbableHome() {
  return (
    <GameLobby game="probable">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
