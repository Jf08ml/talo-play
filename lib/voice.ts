"use client";

import type { Room } from "livekit-client";

/**
 * Voice chat for a room, over LiveKit (an SFU: everyone sends their mic once
 * and the server fans it out). The token comes from `/api/voz/token`.
 *
 * One connection per page, kept in this module rather than in a component, so
 * it survives the header remounting (waiting room → game) and keeps playing
 * while a 3D game hides the header. `VoiceKeeper` leaves when the page is no
 * longer the room's. `livekit-client` is imported only on joining.
 */

export const VOICE_ENABLED = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);

export interface VoicePerson {
  id: string;
  name: string;
  me: boolean;
  speaking: boolean;
  micOn: boolean;
  /** Silenced by me, only on this phone. */
  silenced: boolean;
}

export interface VoiceState {
  status: "off" | "connecting" | "on";
  roomId: string | null;
  micOn: boolean;
  people: VoicePerson[];
  /** The browser blocked autoplay: a tap has to call `startVoiceAudio`. */
  needsTap: boolean;
  error: string | null;
}

const OFF: VoiceState = { status: "off", roomId: null, micOn: false, people: [], needsTap: false, error: null };

let state: VoiceState = OFF;
let room: Room | null = null;
/** Bumped by every join and leave, so a join that was overtaken stops. */
let attempt = 0;
const silenced = new Set<string>();
const listeners = new Set<() => void>();

function set(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeVoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getVoiceState = () => state;
export const getVoiceServerState = () => OFF;

function audioBox(): HTMLElement {
  let box = document.getElementById("talo-voz");
  if (!box) {
    box = document.createElement("div");
    box.id = "talo-voz";
    box.hidden = true;
    document.body.appendChild(box);
  }
  return box;
}

function refresh() {
  if (!room) return;
  const local = room.localParticipant;
  const people: VoicePerson[] = [
    { id: local.identity, name: local.name || "Vos", me: true, speaking: local.isSpeaking, micOn: local.isMicrophoneEnabled, silenced: false },
    ...[...room.remoteParticipants.values()].map((p) => ({
      id: p.identity,
      name: p.name || "Jugador",
      me: false,
      speaking: p.isSpeaking,
      micOn: p.isMicrophoneEnabled,
      silenced: silenced.has(p.identity),
    })),
  ];
  set({ people, micOn: local.isMicrophoneEnabled, needsTap: !room.canPlaybackAudio });
}

export async function joinVoice(roomId: string, clientId: string, name: string): Promise<void> {
  if (state.status !== "off") return;
  const mine = ++attempt;
  set({ ...OFF, status: "connecting", roomId });
  try {
    const res = await fetch("/api/voz/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, clientId, name }),
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string; url?: string; error?: string };
    if (!res.ok || !data.token || !data.url) throw new Error(data.error || "No se pudo entrar a la voz.");

    const { Room, RoomEvent, Track } = await import("livekit-client");
    // Left while the token was on its way.
    if (mine !== attempt) return;
    const r = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    room = r;
    r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      audioBox().appendChild(track.attach());
      if (silenced.has(participant.identity)) participant.setVolume(0);
      refresh();
    })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        refresh();
      })
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
      .on(RoomEvent.Disconnected, () => {
        if (room !== r) return;
        room = null;
        audioBox().replaceChildren();
        set({ ...OFF });
      });

    await r.connect(data.url, data.token);
    if (room !== r) return;
    set({ status: "on" });
    refresh();
    try {
      await r.localParticipant.setMicrophoneEnabled(true);
    } catch {
      set({ error: "Sin permiso de micrófono: escuchás, pero no te escuchan." });
    }
    refresh();
  } catch (err) {
    if (mine !== attempt) return;
    room?.disconnect();
    room = null;
    set({ ...OFF, error: err instanceof Error ? err.message : "No se pudo entrar a la voz." });
  }
}

export function leaveVoice(): void {
  attempt++;
  const r = room;
  room = null;
  r?.disconnect();
  if (typeof document !== "undefined") audioBox().replaceChildren();
  set({ ...OFF });
}

export async function toggleMic(): Promise<void> {
  if (!room) return;
  try {
    await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
    set({ error: null });
  } catch {
    set({ error: "Sin permiso de micrófono: escuchás, pero no te escuchan." });
  }
  refresh();
}

/** Silences (or not) someone only for me. */
export function silencePerson(id: string, on: boolean): void {
  if (on) silenced.add(id);
  else silenced.delete(id);
  room?.remoteParticipants.get(id)?.setVolume(on ? 0 : 1);
  refresh();
}

export async function startVoiceAudio(): Promise<void> {
  await room?.startAudio().catch(() => {});
  refresh();
}

export function clearVoiceError(): void {
  set({ error: null });
}
