"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function MemotestHome() {
  return (
    <GameLobby game="memotest">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
