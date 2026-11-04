"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import { useAccount } from "./AccountProvider";

/** "Amigos" in the light pages' header, with pending friend requests as a badge. */
export default function FriendsLink() {
  const { requests } = useAccount();
  if (!isFirebaseConfigured()) return null;
  return (
    <Link
      href="/amigos"
      aria-label={requests.length ? `Amigos, ${requests.length} solicitudes` : "Amigos"}
      className="relative flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 font-semibold text-talo-ink underline-offset-[6px] hover:underline"
    >
      <Users className="h-5 w-5" strokeWidth={2.4} />
      <span className="hidden sm:inline">Amigos</span>
      {requests.length > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-talo-ink px-1 text-[11px] font-bold text-white">
          {requests.length}
        </span>
      )}
    </Link>
  );
}
