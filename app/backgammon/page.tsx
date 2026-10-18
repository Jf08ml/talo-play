"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function BackgammonHome() {
  return (
    <GameLobby game="backgammon">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
