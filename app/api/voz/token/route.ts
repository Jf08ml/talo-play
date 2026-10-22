import { AccessToken } from "livekit-server-sdk";

/**
 * Signs a LiveKit token for a room's voice chat (`lib/voice.ts`). There is no
 * auth, so the only checks are that the room exists, isn't a public world
 * (strangers) and that the caller is in its presence right now — read through
 * the RTDB REST API, which the rules leave public.
 */

const ROOM_CODE = /^[A-Z0-9]{6}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{4,40}$/;

async function readRtdb(path: string): Promise<unknown> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}/${path}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`RTDB ${res.status}`);
  return res.json();
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return Response.json({ error: "La voz no está configurada." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { roomId?: unknown; clientId?: unknown; name?: unknown } | null;
  const roomId = typeof body?.roomId === "string" ? body.roomId : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 24) : "";
  if (!ROOM_CODE.test(roomId) || !CLIENT_ID.test(clientId)) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    const [presence, online] = await Promise.all([
      readRtdb(`rooms/${roomId}/presence/${clientId}`),
      readRtdb(`rooms/${roomId}/meta/online`),
    ]);
    if (online === true) return Response.json({ error: "Los mundos públicos no tienen voz." }, { status: 403 });
    if (!presence) return Response.json({ error: "Entrá a la sala primero." }, { status: 403 });
  } catch {
    return Response.json({ error: "No se pudo comprobar la sala." }, { status: 502 });
  }

  const token = new AccessToken(key, secret, { identity: clientId, name: name || "Jugador", ttl: "4h" });
  token.addGrant({
    room: `talo-${roomId}`,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  return Response.json({ token: await token.toJwt(), url });
}
