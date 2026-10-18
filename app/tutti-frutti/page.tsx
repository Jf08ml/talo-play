"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function TuttiHome() {
  return (
    <GameLobby game="tutti">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
