"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, Copy, LogOut, Share2, Trash2, UserPlus } from "lucide-react";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import PlayerIdentity from "@/components/PlayerIdentity";
import FirebaseSetupNotice from "@/components/FirebaseSetupNotice";
import NamePrompt from "@/components/NamePrompt";
import { Talo } from "@/components/Talo";
import { SignInButton } from "@/components/FriendInvite";
import { statusLabel, useAccount, useFriends, type Friend } from "@/components/AccountProvider";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import {
  acceptRequest,
  addFriendByCode,
  blockUser,
  declineRequest,
  deleteAccount,
  normalizeCode,
  removeFriend,
  signOutAccount,
  subscribeProfile,
  type AddResult,
  type Profile,
} from "@/lib/account";
import { isFirebaseConfigured } from "@/lib/firebase";
import { roomPath } from "@/lib/games";
import { colorForClient } from "@/lib/ids";
import { playerTalo } from "@/lib/talos";
import { trackEvent } from "@/lib/analytics";

const CARD = "rounded-[24px] border-2 border-talo-ink bg-white p-4 sm:p-6";
const H2 = "font-display text-[24px] leading-[1.05] sm:text-[28px]";
const SMALL_BUTTON =
  "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-[15px] font-bold transition active:scale-[0.97] disabled:opacity-50";

function PlayerTalo({ clientId, size = 40, happy = false, label }: { clientId: string; size?: number; happy?: boolean; label?: string }) {
  const t = playerTalo(clientId, colorForClient(clientId), size);
  return (
    <span className="flex shrink-0 items-end justify-center" style={{ width: size * 1.3, height: size }}>
      <Talo w={t.w} h={t.h} radius={t.radius} color={t.color} expr={happy ? "contento" : "normal"} label={label} />
    </span>
  );
}

const ADD_MESSAGES: Record<AddResult, string> = {
  sent: "¡Listo! Le mandaste la solicitud. Cuando la acepte, aparece en tus amigos.",
  accepted: "¡Ya son amigos! Te había mandado una solicitud.",
  friends: "Ya son amigos.",
  already: "Ya le mandaste una solicitud; falta que la acepte.",
  self: "Ese es tu propio código.",
  unknown: "No encontramos a nadie con ese código. Revisalo.",
};

/** The friends page: sign in, your friend code, add by code, requests, friends and the account. */
export default function AmigosClient({ initialCode }: { initialCode: string }) {
  const identity = useClientIdentity();
  const { user, profile, requests } = useAccount();
  const friends = useFriends(user?.uid);

  if (!isFirebaseConfigured()) return <FirebaseSetupNotice />;

  return (
    <div className="talo-light flex flex-1 flex-col">
      <section className="overflow-hidden bg-talo-hero">
        {/* Signed in, the profile card already shows (and renames) you. */}
        <SiteHeader right={user ? undefined : <PlayerIdentity identity={identity} requireName={false} compact />} />
        <div className="mx-auto flex max-w-[1360px] flex-col gap-3 px-5 pb-10 pt-2 sm:px-10 sm:pb-14 sm:pt-6">
          <h1 className="font-display text-[44px] leading-none tracking-[-0.02em] sm:text-[clamp(56px,6vw,88px)]">Amigos</h1>
          <p className="max-w-xl text-[17px] font-medium leading-[1.4] sm:text-[22px]">
            Agregá a tus amigos con su código y invitalos a jugar directo, sin mandar links.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-8 sm:px-10 sm:py-14">
        {user === undefined || (user && !profile) ? (
          <p className="text-[17px] text-talo-text-3">Cargando…</p>
        ) : !user ? (
          <SignedOut />
        ) : (
          <SignedIn uid={user.uid} profile={profile!} requests={requests} friends={friends} initialCode={initialCode} />
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

function SignedOut() {
  return (
    <div className={`${CARD} mx-auto flex max-w-xl flex-col gap-4`}>
      <h2 className={H2}>Entrá a tu cuenta</h2>
      <ul className="flex flex-col gap-2 text-[17px] text-talo-text-2">
        <li>· Tu talo y tu nombre te siguen en el celu y en la compu.</li>
        <li>· Agregás amigos con un código y ves quién está conectado y a qué juega.</li>
        <li>· Los invitás a tu sala con un toque: les aparece la invitación en Talo.</li>
      </ul>
      <p className="text-[15px] text-talo-text-3">Para jugar no hace falta: la cuenta es solo para tener amigos.</p>
      <SignInButton light />
    </div>
  );
}

function SignedIn({
  uid,
  profile,
  requests,
  friends,
  initialCode,
}: {
  uid: string;
  profile: Profile;
  requests: string[];
  friends: Friend[];
  initialCode: string;
}) {
  return (
    <div className="grid min-w-0 items-start gap-4 sm:gap-6 md:grid-cols-[1fr_1.2fr] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
        <ProfileCard profile={profile} />
        <AddFriend uid={uid} initialCode={initialCode} />
      </div>
      <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
        {requests.length > 0 && (
          <section className={CARD}>
            <h2 className={H2}>Solicitudes</h2>
            <ul className="mt-4 flex flex-col divide-y divide-talo-line">
              {requests.map((from) => (
                <RequestRow key={from} uid={uid} from={from} />
              ))}
            </ul>
          </section>
        )}
        <section className={CARD}>
          <h2 className={H2}>Tus amigos{friends.length > 0 && ` (${friends.length})`}</h2>
          {friends.length === 0 ? (
            <p className="mt-3 text-[17px] text-talo-text-2">
              Todavía no agregaste a nadie. Pasales tu código o agregalos con el suyo.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-talo-line">
              {friends.map((f) => (
                <FriendRow key={f.uid} uid={uid} friend={f} />
              ))}
            </ul>
          )}
        </section>
        <AccountActions profile={profile} />
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const identity = useClientIdentity();
  const link = () => `${window.location.origin}/amigos?agregar=${profile.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profile.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard: the code is on screen anyway.
    }
  };
  const share = async () => {
    const text = `Agregame en Talo para jugar juntos: mi código es ${profile.code}`;
    if (navigator.share) {
      await navigator.share({ title: "Talo", text, url: link() }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${link()}`)}`, "_blank", "noopener");
    }
  };

  return (
    <section className={CARD}>
      <div className="flex items-center gap-3 sm:gap-4">
        <PlayerTalo clientId={profile.clientId} size={56} happy label={profile.name} />
        <div className="min-w-0">
          <p className="truncate font-display text-[24px] leading-tight sm:text-[28px]">{profile.name}</p>
          <button onClick={() => setEditing(true)} className="text-[15px] font-bold text-talo-text-3 underline-offset-4 hover:underline">
            Cambiar nombre
          </button>
        </div>
      </div>
      <p className="mt-6 text-[15px] font-bold text-talo-text-3">Tu código de amigo</p>
      <div role="img" aria-label={`Tu código: ${profile.code.split("").join(" ")}`} className="mt-2 flex gap-1.5">
        {profile.code.split("").map((c, i) => (
          <span key={i} className="grid h-12 min-w-0 flex-1 place-items-center rounded-xl bg-talo-surface font-code text-[22px] sm:h-[56px] sm:text-[26px]">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={share} className={`${SMALL_BUTTON} flex-1 bg-talo-ink text-white hover:bg-black`}>
          <Share2 className="h-4 w-4" /> Compartir
        </button>
        <button onClick={copy} className={`${SMALL_BUTTON} border-2 border-talo-ink text-talo-ink hover:bg-talo-surface`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {editing &&
        createPortal(
          <NamePrompt
            initialValue={profile.name}
            submitLabel="Guardar"
            onCancel={() => setEditing(false)}
            onSubmit={(name) => {
              // The provider saves it to the account too.
              identity.setName(name);
              setEditing(false);
            }}
          />,
          document.body
        )}
    </section>
  );
}

function AddFriend({ uid, initialCode }: { uid: string; initialCode: string }) {
  const [code, setCode] = useState(normalizeCode(initialCode));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult | "error" | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (normalizeCode(code).length !== 6) return;
    setBusy(true);
    try {
      const res = await addFriendByCode(uid, code);
      setResult(res);
      trackEvent("add_friend", { result: res });
      if (res === "sent" || res === "accepted") setCode("");
    } catch (err) {
      console.error(err);
      setResult("error");
    } finally {
      setBusy(false);
    }
  };

  const good = result === "sent" || result === "accepted" || result === "friends";
  return (
    <section className={CARD}>
      <h2 className={H2}>Agregar amigo</h2>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(normalizeCode(e.target.value));
            setResult(null);
          }}
          placeholder="Su código"
          aria-label="Código de amigo"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border-2 border-talo-ink bg-white px-3 font-code text-[20px] uppercase tracking-[0.15em] sm:text-[22px] sm:tracking-[0.2em] outline-none placeholder:font-sans placeholder:text-[17px] placeholder:normal-case placeholder:tracking-normal placeholder:text-talo-text-3 focus:bg-talo-surface"
        />
        <button
          disabled={busy || code.length !== 6}
          className={`${SMALL_BUTTON} min-h-[52px] shrink-0 bg-talo-ink px-4 text-white hover:bg-black sm:px-5`}
        >
          <UserPlus className="h-4 w-4" /> Agregar
        </button>
      </form>
      {result && (
        <p className={`mt-3 text-[15px] font-semibold ${good ? "text-talo-green" : "text-talo-text-2"}`}>
          {result === "error" ? "No se pudo. Probá de nuevo en un rato." : ADD_MESSAGES[result]}
        </p>
      )}
    </section>
  );
}

function useProfile(uid: string): Profile | null {
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => subscribeProfile(uid, setP), [uid]);
  return p;
}

/** A person with actions. `wide`: on phones the actions go on their own line, sharing it. */
function Row({
  clientId,
  name,
  sub,
  happy,
  wide = false,
  children,
}: {
  clientId: string;
  name: string;
  sub?: ReactNode;
  happy?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <PlayerTalo clientId={clientId} happy={happy} label={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-bold">{name}</p>
        {sub}
      </div>
      <div className={`flex max-w-full flex-wrap justify-end gap-2 ${wide ? "basis-full sm:basis-auto [&>*]:flex-1 sm:[&>*]:flex-none" : ""}`}>
        {children}
      </div>
    </li>
  );
}

function RequestRow({ uid, from }: { uid: string; from: string }) {
  const p = useProfile(from);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .catch(console.error)
      .finally(() => setBusy(false));
  };
  return (
    <Row clientId={p.clientId} name={p.name} wide sub={<p className="text-sm text-talo-text-3">Quiere ser tu amigo</p>}>
      <button disabled={busy} onClick={() => act(() => acceptRequest(uid, from))} className={`${SMALL_BUTTON} bg-talo-ink text-white hover:bg-black`}>
        Aceptar
      </button>
      <button disabled={busy} onClick={() => act(() => declineRequest(uid, from))} className={`${SMALL_BUTTON} border-2 border-talo-ink hover:bg-talo-surface`}>
        Rechazar
      </button>
      <button
        disabled={busy}
        onClick={() => act(() => blockUser(uid, from))}
        title="No va a poder mandarte más solicitudes"
        className={`${SMALL_BUTTON} text-talo-text-3 hover:bg-talo-surface`}
      >
        Bloquear
      </button>
    </Row>
  );
}

function FriendRow({ uid, friend }: { uid: string; friend: Friend }) {
  const [confirm, setConfirm] = useState(false);
  const p = friend.profile;
  if (!p) return null;
  const s = friend.status;
  return (
    <Row
      clientId={p.clientId}
      name={p.name}
      happy={!!s}
      wide={confirm}
      sub={
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${s ? "text-talo-green" : "text-talo-text-3"}`}>
          <span className={`h-2 w-2 rounded-full ${s ? "bg-talo-green" : "bg-talo-line"}`} />
          {statusLabel(s)}
        </p>
      }
    >
      {s?.room && s.game && (
        <Link href={roomPath(s.game, s.room)} className={`${SMALL_BUTTON} bg-talo-hero text-talo-ink hover:bg-[#ffe033]`}>
          Unirme
        </Link>
      )}
      {confirm ? (
        <>
          <button onClick={() => removeFriend(uid, friend.uid).catch(console.error)} className={`${SMALL_BUTTON} bg-red-600 text-white hover:bg-red-700`}>
            Sí, eliminar
          </button>
          <button onClick={() => setConfirm(false)} className={`${SMALL_BUTTON} border-2 border-talo-ink hover:bg-talo-surface`}>
            No
          </button>
        </>
      ) : (
        <button onClick={() => setConfirm(true)} aria-label={`Eliminar a ${p.name}`} className={`${SMALL_BUTTON} px-2.5 text-talo-text-3 hover:bg-talo-surface`}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </Row>
  );
}

function AccountActions({ profile }: { profile: Profile }) {
  const { user } = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="flex flex-col gap-3 rounded-[24px] bg-talo-surface p-4 sm:p-6">
      <p className="break-words text-[15px] text-talo-text-3">
        Entraste con Google{user?.email ? ` (${user.email})` : ""}. Tu cuenta solo sirve para tus amigos; jugar sigue siendo igual.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => signOutAccount().catch(console.error)} className={`${SMALL_BUTTON} border-2 border-talo-ink bg-white hover:bg-talo-surface`}>
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} className={`${SMALL_BUTTON} text-red-700 hover:bg-white`}>
            Borrar mi cuenta
          </button>
        ) : (
          <button
            disabled={busy || !user}
            onClick={async () => {
              if (!user) return;
              setBusy(true);
              setError("");
              try {
                await deleteAccount(user, profile);
              } catch (err) {
                console.error(err);
                setError("No se pudo borrar. Probá de nuevo.");
                setBusy(false);
              }
            }}
            className={`${SMALL_BUTTON} bg-red-600 text-white hover:bg-red-700`}
          >
            {busy ? "Borrando…" : "Sí, borrar todo (amigos incluidos)"}
          </button>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </section>
  );
}
