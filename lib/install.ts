/**
 * «Instalar Talo»: the browser's install prompt is caught as soon as it fires
 * (`beforeinstallprompt`, Chrome/Edge/Android) and kept here until someone
 * taps the button; iPhone/iPad have no prompt, so the button explains
 * «Compartir → Agregar a inicio» instead. Nothing shows once Talo runs as the
 * installed app.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function listenInstall() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** What the install button can do here: open the browser's prompt, explain the iPhone steps, or nothing. */
export function installMode(): "prompt" | "ios" | "none" {
  if (typeof window === "undefined" || installed || isStandalone()) return "none";
  if (deferred) return "prompt";
  return isIos() ? "ios" : "none";
}

/** Opens the browser's install prompt; true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === "accepted";
}
