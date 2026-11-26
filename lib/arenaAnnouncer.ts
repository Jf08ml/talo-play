/**
 * Arena medieval's announcer: short phrases on screen and, when the device
 * has a Spanish voice, said out loud with the browser's speech synthesis
 * (no audio files, nothing to download). A phrase may be dropped when another
 * one is still being said, so moments don't pile up; the important ones
 * (`priority`) cut in. Muted together with the game's sound.
 */

export type AnnounceKind =
  | "fight"
  | "firstKo"
  | "doubleKo"
  | "tripleKo"
  | "streak"
  | "lastStanding"
  | "comeback"
  | "parry"
  | "special"
  | "roundWin"
  | "roundLoss"
  | "roundDraw"
  | "victory"
  | "defeat"
  | "levelUp"
  | "challenge";

export interface Announcement {
  kind: AnnounceKind;
  text: string;
  /** Says it even if another phrase is playing. */
  priority: boolean;
  /** Color hint for the on-screen banner. */
  tone: "gold" | "red" | "blue" | "white" | "green";
}

const PRIORITY: AnnounceKind[] = ["fight", "victory", "defeat", "roundWin", "roundLoss", "roundDraw", "lastStanding", "levelUp"];

/** The phrase for a moment; `n` for streaks, `team` for rounds, `extra` for level and challenge names. */
export function phrase(kind: AnnounceKind, opts: { n?: number; team?: string; extra?: string } = {}): Announcement {
  const t = (text: string, tone: Announcement["tone"] = "gold"): Announcement => ({ kind, text, priority: PRIORITY.includes(kind), tone });
  switch (kind) {
    case "fight":
      return t("¡A pelear!");
    case "firstKo":
      return t("¡Primer derribo!", "white");
    case "doubleKo":
      return t("¡Doble derribo!");
    case "tripleKo":
      return t("¡Triple derribo!");
    case "streak":
      return t(`¡Racha de ${opts.n ?? 3}!`);
    case "lastStanding":
      return t("¡Último en pie!", "white");
    case "comeback":
      return t("¡Remontada!", "green");
    case "parry":
      return t("¡Parada perfecta!", "white");
    case "special":
      return t("¡Golpe especial!");
    case "roundWin":
      return t(opts.team ? `¡Ronda para el ${opts.team}!` : "¡Ronda ganada!", "green");
    case "roundLoss":
      return t(opts.team ? `Ronda para el ${opts.team}` : "Ronda perdida", "red");
    case "roundDraw":
      return t("Ronda empatada", "white");
    case "victory":
      return t("¡Victoria!", "gold");
    case "defeat":
      return t("Derrota", "red");
    case "levelUp":
      return t(opts.extra ? `¡Nivel ${opts.extra}!` : "¡Subiste de nivel!", "gold");
    case "challenge":
      return t(opts.extra ? `Desafío cumplido: ${opts.extra}` : "¡Desafío cumplido!", "green");
  }
}

let muted = false;
let voice: SpeechSynthesisVoice | null | undefined;
let speakingUntil = 0;

export function setAnnouncerMuted(m: boolean) {
  muted = m;
  if (m && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** A Spanish voice, preferring Latin American ones; null when the device has none. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const es = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const rank = (v: SpeechSynthesisVoice) =>
    (/(419|mx|us|co|ar|cl|pe)/i.test(v.lang) ? 4 : 0) + (v.localService ? 1 : 0) + (/google|natural|neural|online/i.test(v.name) ? 2 : 0);
  return es.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

if (typeof speechSynthesis !== "undefined") {
  // Some browsers load their voices late.
  speechSynthesis.addEventListener?.("voiceschanged", () => (voice = pickVoice()));
}

/** Says the announcement out loud (if there's a voice and sound is on). */
export function speak(a: Announcement) {
  if (muted || typeof speechSynthesis === "undefined") return;
  if (voice === undefined) voice = pickVoice();
  if (!voice) return;
  const now = performance.now();
  if (now < speakingUntil && !a.priority) return;
  try {
    if (a.priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(a.text.replace(/[¡!]/g, ""));
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1.12;
    u.pitch = a.tone === "red" ? 0.85 : 0.95;
    u.volume = 1;
    speakingUntil = now + 300 + a.text.length * 70;
    speechSynthesis.speak(u);
  } catch {
    // No voice here: the banner is enough.
  }
}
