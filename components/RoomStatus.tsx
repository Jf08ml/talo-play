import Link from "next/link";
import { MAX_IDLE_DAYS } from "@/lib/roomCleanup";
import { TaloMark } from "./TaloLogo";

// Full-area placeholders shown inside a room's <main> while it isn't playable.

export function RoomLoading({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 text-slate-400">
      <TaloMark className="h-10 w-10 animate-pulse" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function RoomNotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
      <p className="text-lg font-medium text-slate-200">No encontramos esa sala.</p>
      <p>Revisá el código o pedile a quien la creó que te comparta el enlace de nuevo.</p>
      <p className="max-w-sm text-sm text-slate-500">
        Las salas se borran solas después de {MAX_IDLE_DAYS} días sin uso. Si era una sala vieja, creá una nueva: es un minuto.
      </p>
      <Link href="/" className="mt-3 text-violet-400 hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

export function RoomError({ message }: { message: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
      <p className="text-lg font-medium text-red-400">Ocurrió un error.</p>
      <p>{message}</p>
    </div>
  );
}
