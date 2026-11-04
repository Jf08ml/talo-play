"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { X } from "lucide-react";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  INVITE_TTL_MS,
  dismissInvite,
  ensureProfile,
  keepOnline,
  saveProfileName,
  subscribeAuth,
  subscribeFriends,
  subscribeInvites,
  subscribeProfile,
  subscribeRequests,
  subscribeStatus,
  type Invite,
  type Profile,
  type Status,
} from "@/lib/account";
import { adoptIdentity, readClientId, readName, subscribeNameChanges } from "@/hooks/useClientIdentity";
import { GAMES, roomPath } from "@/lib/games";
import { colorForClient } from "@/lib/ids";
import { playerTalo } from "@/lib/talos";
import { playSound } from "@/lib/sfx";
import { serverNow } from "@/lib/serverTime";
import { Talo } from "./Talo";

interface AccountState {
  /** undefined while Firebase Auth hasn't answered yet. */
  user: User | null | undefined;
  profile: Profile | null;
  /** Pending friend requests to me. */
  requests: string[];
}

const NONE: string[] = [];
const NO_INVITES: Invite[] = [];

const AccountContext = createContext<AccountState>({ user: undefined, profile: null, requests: [] });

export const useAccount = () => useContext(AccountContext);

/** A room's page: its path has a room code (6 uppercase letters/digits). */
export const isRoomPath = (path: string) => path.split("/").some((seg) => /^[A-Z0-9]{6}$/.test(seg));

/**
 * The signed-in account for the whole site (root layout): its profile, the
 * online status friends see, friend requests, and the invites that arrive
 * while browsing (a card with "Unirme"). Without an account it does nothing.
 */
export default function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(() => (isFirebaseConfigured() ? undefined : null));
  // What belongs to the signed-in account, tagged with its uid (stale data from another one is ignored).
  const [data, setData] = useState<{ uid: string; profile: Profile | null; requests: string[]; invites: Invite[] } | null>(null);
  const pathname = usePathname();
  const uid = user?.uid;
  const mine = uid && data?.uid === uid ? data : null;
  const profile = mine?.profile ?? null;
  const requests = mine?.requests ?? NONE;
  const invites = mine?.invites ?? NO_INVITES;
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    return subscribeAuth(setUser);
  }, []);

  // The profile (made on the first sign-in), online status, requests and invites.
  useEffect(() => {
    const u = userRef.current;
    if (!uid || !u) return;
    let stop = false;
    const offs: (() => void)[] = [];
    const put = (patch: Partial<{ profile: Profile | null; requests: string[]; invites: Invite[] }>) =>
      setData((d) => ({ ...(d?.uid === uid ? d : { uid, profile: null, requests: [], invites: [] }), ...patch }));
    ensureProfile(u, readClientId(), readName())
      .then(() => {
        if (stop) return;
        offs.push(subscribeProfile(uid, (p) => put({ profile: p })));
        offs.push(subscribeRequests(uid, (r) => put({ requests: r })));
        offs.push(subscribeInvites(uid, (i) => put({ invites: i })));
        offs.push(keepOnline(uid));
      })
      .catch(console.error);
    return () => {
      stop = true;
      offs.forEach((off) => off());
    };
  }, [uid]);

  // The account's talo and name on this device — but never mid-room, where the id is your seat.
  useEffect(() => {
    if (profile && !isRoomPath(pathname)) adoptIdentity(profile.clientId, profile.name);
  }, [profile, pathname]);

  // Renaming yourself renames the account.
  const profileName = profile?.name;
  useEffect(() => {
    if (!uid) return;
    return subscribeNameChanges(() => {
      const name = readName();
      if (name && name !== profileName) saveProfileName(uid, name).catch(console.error);
    });
  }, [uid, profileName]);

  return (
    <AccountContext.Provider value={{ user, profile, requests }}>
      {children}
      {uid && <InviteToast uid={uid} invites={invites} />}
    </AccountContext.Provider>
  );
}

/** The newest fresh invite, as a card on top of any page. */
function InviteToast({ uid, invites }: { uid: string; invites: Invite[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const announced = useRef(new Set<string>());
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 30000);
    return () => clearInterval(t);
  }, []);

  // Old ones and ones for the room I'm already in go away on their own.
  useEffect(() => {
    for (const inv of invites) {
      const here = pathname.split("/").includes(inv.room);
      if (here || now - inv.at > INVITE_TTL_MS) dismissInvite(uid, inv.key).catch(() => {});
    }
  }, [invites, pathname, now, uid]);

  const inv = [...invites].reverse().find((i) => now - i.at <= INVITE_TTL_MS && GAMES[i.game] && !pathname.split("/").includes(i.room));

  useEffect(() => {
    if (!inv || announced.current.has(inv.key)) return;
    announced.current.add(inv.key);
    playSound("turn");
    navigator.vibrate?.(120);
  }, [inv]);

  if (!inv) return null;
  const talo = playerTalo(inv.clientId, colorForClient(inv.clientId), 40);

  return (
    <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-talo-ink p-3 text-white shadow-2xl ring-1 ring-white/15 sm:bottom-6">
      <Talo w={talo.w} h={talo.h} radius={talo.radius} color={talo.color} expr="contento" label={inv.name} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold">{inv.name} te invita a jugar</p>
        <p className="truncate text-sm text-white/70">{GAMES[inv.game].title}</p>
      </div>
      <button
        onClick={() => {
          dismissInvite(uid, inv.key).catch(() => {});
          router.push(roomPath(inv.game, inv.room));
        }}
        className="shrink-0 rounded-xl bg-talo-hero px-4 py-2.5 text-sm font-bold text-talo-ink transition hover:bg-[#ffe033] active:scale-95"
      >
        Unirme
      </button>
      <button
        onClick={() => dismissInvite(uid, inv.key).catch(() => {})}
        aria-label="Descartar la invitación"
        className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export interface Friend {
  uid: string;
  profile: Profile | null;
  status: Status | null;
}

/** My friends with their profile and live status (online first, then by name). */
export function useFriends(uid: string | undefined): Friend[] {
  const [list, setList] = useState<{ uid: string; ids: string[] } | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile | null>>({});
  const [statuses, setStatuses] = useState<Record<string, Status | null>>({});
  const ids = uid && list?.uid === uid ? list.ids : NONE;

  useEffect(() => {
    if (!uid) return;
    return subscribeFriends(uid, (found) => setList({ uid, ids: found }));
  }, [uid]);

  const key = ids.join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    const offs = list.flatMap((id) => [
      subscribeProfile(id, (p) => setProfiles((m) => ({ ...m, [id]: p }))),
      subscribeStatus(id, (s) => setStatuses((m) => ({ ...m, [id]: s }))),
    ]);
    return () => offs.forEach((off) => off());
  }, [key]);

  return ids
    .map((id) => ({ uid: id, profile: profiles[id] ?? null, status: statuses[id] ?? null }))
    .sort((a, b) => Number(!!b.status) - Number(!!a.status) || (a.profile?.name ?? "").localeCompare(b.profile?.name ?? ""));
}

/** "Jugando a Truco", "En línea" or "Desconectado". */
export function statusLabel(s: Status | null): string {
  if (!s) return "Desconectado";
  if (s.room && s.game && GAMES[s.game]) return `Jugando a ${GAMES[s.game].title}`;
  return "En línea";
}
