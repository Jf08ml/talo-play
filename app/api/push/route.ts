import { sendNotification, setVapidDetails } from "web-push";
import { GAMES, roomPath, type GameId } from "@/lib/games";

/**
 * Sends a push notification to a friend (lib/push.ts). No admin credentials:
 * every read goes through the RTDB REST API with the sender's own Firebase ID
 * token (`?auth=`), so the database rules check that the sender is who they
 * say and may notify the target — friends for invites, messages and accepted
 * requests; a pending request of theirs for a new request — and only then let
 * the target's subscriptions (`push/{uid}`) be read.
 */

const UID = /^[A-Za-z0-9]{10,40}$/;
const ROOM = /^[A-Z0-9]{6}$/;
const KINDS = ["invite", "request", "accepted", "dm"] as const;
type Kind = (typeof KINDS)[number];

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function uidOf(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { user_id?: string; sub?: string };
    return payload.user_id ?? payload.sub ?? "";
  } catch {
    return "";
  }
}

/** A read as the sender; null when the rules say no or there's nothing there. */
async function readAs(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL}/${path}.json?auth=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return Response.json({ error: "Las notificaciones no están configuradas." }, { status: 503 });

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sender = uidOf(token);
  const body = (await request.json().catch(() => null)) as { kind?: unknown; to?: unknown; room?: unknown; game?: unknown; text?: unknown } | null;
  const kind = KINDS.includes(body?.kind as Kind) ? (body!.kind as Kind) : null;
  const to = typeof body?.to === "string" ? body.to : "";
  if (!token || !UID.test(sender) || !kind || !UID.test(to) || to === sender) return Response.json({ error: "Datos inválidos." }, { status: 400 });

  // May the sender notify them? (The read itself also proves the token is theirs.)
  const allowed =
    kind === "request" ? !!(await readAs(token, `requests/${to}/${sender}`)) : (await readAs(token, `friends/${sender}/${to}`)) === true;
  if (!allowed) return Response.json({ error: "No puedes avisarle." }, { status: 403 });

  const name = String((await readAs(token, `profiles/${sender}/name`)) ?? "Alguien").slice(0, 24);
  let payload: { title: string; body: string; url: string; tag: string };
  if (kind === "invite") {
    const game = typeof body?.game === "string" && body.game in GAMES ? (body.game as GameId) : null;
    const room = typeof body?.room === "string" && ROOM.test(body.room) ? body.room : "";
    if (!game || !room) return Response.json({ error: "Datos inválidos." }, { status: 400 });
    payload = { title: `${name} te invita a jugar`, body: `${GAMES[game].title} · toca para entrar a la sala`, url: roomPath(game, room), tag: `invite-${sender}` };
  } else if (kind === "request") {
    payload = { title: "Nueva solicitud de amistad", body: `${name} quiere ser tu amigo en Talo`, url: "/amigos", tag: `request-${sender}` };
  } else if (kind === "accepted") {
    payload = { title: `${name} aceptó tu solicitud`, body: "Ya pueden invitarse a jugar", url: "/amigos", tag: `accepted-${sender}` };
  } else {
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 140) : "";
    if (!text) return Response.json({ error: "Datos inválidos." }, { status: 400 });
    payload = { title: name, body: text, url: "/amigos", tag: `dm-${sender}` };
  }

  const subs = Object.values(((await readAs(token, `push/${to}`)) ?? {}) as Record<string, Sub>).filter((s) => s?.endpoint && s.p256dh && s.auth);
  if (!subs.length) return Response.json({ sent: 0 });

  setVapidDetails(process.env.VAPID_SUBJECT || "https://taloplay.com", publicKey, privateKey);
  const results = await Promise.allSettled(
    subs.map((s) =>
      sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
        // An invite is only useful for a few minutes; the rest can wait a day.
        TTL: kind === "invite" ? 600 : 86400,
        urgency: "high",
      })
    )
  );
  return Response.json({ sent: results.filter((r) => r.status === "fulfilled").length });
}
