/**
 * Where a scanned QR takes you, or null if it isn't Talo's: a room code
 * (6 letters and digits, through `/sala/{code}`, like typing it) or a link to
 * Talo (any page: a room, a lobby, a friend code), opened by its path.
 */
export function qrTarget(text: string, host: string): string | null {
  const t = text.trim();
  if (/^[A-Za-z0-9]{6}$/.test(t)) return `/sala/${t.toUpperCase()}`;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const name = url.hostname.toLowerCase();
  const ours = url.host === host || name === "taloplay.com" || name.endsWith(".taloplay.com") || name.endsWith(".trycloudflare.com");
  if (!ours) return null;
  return `${url.pathname}${url.search}` || "/";
}
