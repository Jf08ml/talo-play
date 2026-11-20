"use client";

import dynamic from "next/dynamic";

// three.js needs the browser.
const TroncoScreen = dynamic(() => import("@/components/tronco/Screen"), { ssr: false });

export default function ScreenClient({ roomId }: { roomId: string }) {
  return <TroncoScreen roomId={roomId} />;
}
