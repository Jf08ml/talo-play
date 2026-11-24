"use client";

import GameLobby from "@/components/GameLobby";
import { CreateRoomForm } from "@/components/RoomSettings";
import { SETTINGS } from "./settings";

export default function EmpujonesLobby() {
  return (
    <GameLobby game="empujones">
      <CreateRoomForm settings={SETTINGS} />
    </GameLobby>
  );
}
