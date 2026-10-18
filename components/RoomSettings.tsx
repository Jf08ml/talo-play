"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Settings2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { roomPath, type GameId } from "@/lib/games";
import { useClientIdentity } from "@/hooks/useClientIdentity";
import { backToWaiting } from "@/lib/roomSettings";
import type { PresenceMap } from "@/lib/presence";
import { startPermission } from "./WaitingRoom";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass, segmentClass } from "./ui";

/**
 * A game's settings described once and used twice: the create-room form in
 * the lobby (`CreateRoomForm`) and the editor the host gets in the waiting
 * room (`RoomSettingsEditor`). `T` is the game's settings object.
 */

export interface Option<V> {
  value: V;
  label: ReactNode;
  /** Small second line under the label. */
  sub?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

interface Shown<T> {
  /** Hide the field for some values (e.g. turn time only in turn mode). */
  show?: (v: T) => boolean;
  /** Only in the lobby (intro text), or only in the waiting room. */
  only?: "create" | "edit";
}

/** Keys of T whose values are `V`. */
type KeyOf<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

export type Field<T> = Shown<T> &
  (
    | {
        kind: "choice";
        key: keyof T;
        label: string;
        options: Option<unknown>[] | ((v: T) => Option<unknown>[]);
        /** Grid columns (default 3); "list" stacks them; "segment" is a two/three-way toggle. */
        layout?: number | "list" | "segment";
        hint?: (v: T) => ReactNode;
        /** Extra changes when picking (e.g. clamp another field). */
        onPick?: (value: unknown, v: T) => Partial<T>;
      }
    | {
        kind: "multi";
        key: KeyOf<T, unknown[]>;
        label: string | ((v: T) => string);
        options: Option<unknown>[];
        layout?: number | "list" | "wrap";
        hint?: (v: T) => ReactNode;
      }
    | { kind: "toggle"; key: KeyOf<T, boolean>; label: string; hint?: string; icon?: LucideIcon }
    | { kind: "custom"; render: (v: T, set: (patch: Partial<T>) => void, editing: boolean) => ReactNode }
    | { kind: "note"; text: ReactNode | ((v: T) => ReactNode) }
  );

/** A room's meta as read from the database: each game's `fromMeta` knows its shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawMeta = Record<string, any>;

export interface GameSettings<T> {
  game: GameId;
  initial: T;
  fields: Field<T>[];
  /** What's wrong with these settings (blocks creating/saving), or null. */
  problem?: (v: T) => string | null;
  create: (v: T, hostId: string) => Promise<string>;
  save: (roomId: string, v: T) => Promise<void>;
  /** Settings as stored in a room's meta (missing fields → defaults). */
  fromMeta: (meta: RawMeta) => T;
  /** Where to go after creating (default: the room). */
  afterCreate?: (roomId: string, v: T) => string;
  createLabel?: (v: T) => string;
  /** Settings can change mid-game too (endless games). */
  anytime?: boolean;
}

// Literal class names, so Tailwind generates them.
/**
 * After a game: back to the waiting room, to change the settings (or let
 * more people in) before the next one. Shown to whoever may start a game.
 */
export function BackToRoomButton({
  roomId,
  stateKey,
  gameNo,
  hostId,
  presence,
  myId,
}: {
  roomId: string;
  /** The game's state path inside the room, e.g. "tutti/state". */
  stateKey: string;
  gameNo?: number;
  hostId: string;
  presence: PresenceMap;
  myId: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!startPermission(hostId, undefined, presence, myId).canStart) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        backToWaiting(roomId, stateKey, gameNo)
          .catch(console.error)
          .finally(() => setBusy(false));
      }}
      className="flex items-center justify-center gap-1.5 text-xs text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline disabled:opacity-50"
    >
      <Settings2 className="h-3.5 w-3.5" />
      Volver a la sala y cambiar la configuración
    </button>
  );
}

/** A free-text box (own words, phrases…) for a `custom` field. */
export function SettingsTextArea({
  label,
  value,
  onChange,
  placeholder,
  footer,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  footer?: ReactNode;
}) {
  return (
    <div>
      <p className={SECTION_LABEL}>{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
      />
      {footer}
    </div>
  );
}

/** Options from a list of values (e.g. `[3, 5, 7]` → "3 rondas"…). */
export function choices<V>(values: readonly V[], label: (v: V) => ReactNode, sub?: (v: V) => ReactNode): Option<V>[] {
  return values.map((value) => ({ value, label: label(value), sub: sub?.(value) }));
}

const gridCols = (n: number) =>
  ({ 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" })[n] ?? "grid-cols-3";
const multiCols = (n: number) =>
  ({ 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" })[n] ??
  "grid-cols-2 sm:grid-cols-3";

function OptionButton<V>({ o, on, onClick, list }: { o: Option<V>; on: boolean; onClick: () => void; list?: boolean }) {
  const Icon = o.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={o.disabled}
      aria-pressed={on}
      className={`${chipClass(on)} ${list ? "flex items-baseline gap-2 !px-3 !py-2 text-left" : "flex flex-col items-center justify-center gap-0.5"} disabled:cursor-not-allowed disabled:opacity-30`}
    >
      <span className={`flex items-center gap-1.5 ${list ? "text-sm" : ""}`}>
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {o.label}
      </span>
      {o.sub && <span className={`text-[10px] font-normal ${list ? "opacity-70" : "text-slate-500"}`}>{o.sub}</span>}
    </button>
  );
}

/** The fields of a game's settings. */
export function SettingsFields<T>({
  settings,
  value,
  onChange,
  editing,
}: {
  settings: GameSettings<T>;
  value: T;
  onChange: (v: T) => void;
  editing: boolean;
}) {
  const set = (patch: Partial<T>) => onChange({ ...value, ...patch });
  return (
    <>
      {settings.fields.map((f, i) => {
        if (f.show && !f.show(value)) return null;
        if (f.only === "create" && editing) return null;
        if (f.only === "edit" && !editing) return null;
        switch (f.kind) {
          case "note":
            return (
              <p key={i} className="text-sm text-slate-400">
                {typeof f.text === "function" ? f.text(value) : f.text}
              </p>
            );
          case "custom":
            return <div key={i}>{f.render(value, set, editing)}</div>;
          case "toggle": {
            const on = Boolean(value[f.key]);
            const Icon = f.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => set({ [f.key]: !on } as Partial<T>)}
                aria-pressed={on}
                className={`${chipClass(on)} flex items-center gap-2 px-3 py-2.5 text-left text-sm`}
              >
                {Icon && <Icon className="h-5 w-5 shrink-0" />}
                <span className="flex-1">
                  {f.label}
                  {f.hint && <span className="block text-xs font-normal text-slate-500">{f.hint}</span>}
                </span>
                <span className="font-semibold">{on ? "Sí" : "No"}</span>
              </button>
            );
          }
          case "choice": {
            const options = typeof f.options === "function" ? f.options(value) : f.options;
            const current = value[f.key];
            const pick = (o: Option<unknown>) => set({ [f.key]: o.value, ...f.onPick?.(o.value, value) } as Partial<T>);
            return (
              <div key={i}>
                <p className={SECTION_LABEL}>{f.label}</p>
                {f.layout === "segment" ? (
                  <div className={`grid ${gridCols(options.length)} gap-1 rounded-lg bg-slate-950/60 p-1`}>
                    {options.map((o) => (
                      <button
                        key={String(o.value)}
                        type="button"
                        onClick={() => pick(o)}
                        disabled={o.disabled}
                        className={`${segmentClass(current === o.value)} disabled:opacity-30`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={f.layout === "list" ? "flex flex-col gap-1.5" : `grid ${gridCols(f.layout ?? 3)} gap-1.5`}>
                    {options.map((o) => (
                      <OptionButton key={String(o.value)} o={o} on={current === o.value} onClick={() => pick(o)} list={f.layout === "list"} />
                    ))}
                  </div>
                )}
                {f.hint && <p className="mt-1.5 text-xs text-slate-500">{f.hint(value)}</p>}
              </div>
            );
          }
          case "multi": {
            const current = (value[f.key] as unknown[]) ?? [];
            const toggle = (v: unknown) =>
              set({ [f.key]: current.includes(v) ? current.filter((x) => x !== v) : [...current, v] } as Partial<T>);
            return (
              <div key={i}>
                <p className={SECTION_LABEL}>{typeof f.label === "function" ? f.label(value) : f.label}</p>
                <div
                  className={
                    f.layout === "list"
                      ? "flex flex-col gap-1.5"
                      : f.layout === "wrap"
                        ? "flex flex-wrap gap-1.5"
                        : `grid ${multiCols(f.layout ?? 3)} gap-1.5`
                  }
                >
                  {f.options.map((o) => (
                    <OptionButton
                      key={String(o.value)}
                      o={o}
                      on={current.includes(o.value)}
                      onClick={() => toggle(o.value)}
                      list={f.layout === "list"}
                    />
                  ))}
                </div>
                {f.hint && <p className="mt-1.5 text-xs text-slate-500">{f.hint(value)}</p>}
              </div>
            );
          }
        }
      })}
    </>
  );
}

/** The lobby's create-room form for a game. */
export function CreateRoomForm<T>({ settings }: { settings: GameSettings<T> }) {
  const router = useRouter();
  const identity = useClientIdentity();
  const [value, setValue] = useState<T>(settings.initial);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const problem = settings.problem?.(value) ?? null;

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = await settings.create(value, identity.clientId);
      trackEvent("create_room", { game: settings.game });
      router.push(settings.afterCreate?.(roomId, value) ?? roomPath(settings.game, roomId));
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof Error && err.message ? err.message : "No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
      <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>
      <SettingsFields settings={settings} value={value} onChange={setValue} editing={false} />
      <p className="text-xs text-slate-500">Después, desde la sala, vas a poder cambiar esta configuración.</p>
      {problem && <p className="text-sm text-amber-300/90">{problem}</p>}
      {createError && <p className="text-sm text-red-400">{createError}</p>}
      <button type="submit" disabled={creating || problem !== null} className={`mt-auto ${PRIMARY_BUTTON}`}>
        {creating ? "Creando sala…" : (settings.createLabel?.(value) ?? "Crear sala")}
      </button>
    </form>
  );
}

/**
 * "Configuración de la sala" in the waiting room: the host (or whoever may
 * start) opens it, changes the settings and saves them for everyone.
 */
export function RoomSettingsEditor<T>({
  settings,
  roomId,
  meta,
}: {
  settings: GameSettings<T>;
  roomId: string;
  meta: RawMeta | null;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  if (!settings.fields.some((f) => f.kind !== "note")) return null;
  const problem = draft ? (settings.problem?.(draft) ?? null) : null;

  const save = async () => {
    if (!draft || problem) return;
    setSaving(true);
    setError(null);
    try {
      await settings.save(roomId, draft);
      trackEvent("edit_room", { game: settings.game });
      setDraft(null);
      setSavedAt(Date.now());
    } catch (err) {
      console.error(err);
      setError(err instanceof Error && err.message ? err.message : "No se pudo guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (!draft) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(settings.fromMeta(meta ?? {}));
          setError(null);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-violet-400/40 bg-violet-500/5 px-3 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-violet-500/10"
      >
        <Settings2 className="h-4 w-4" />
        {savedAt ? "¡Guardado! Cambiar de nuevo" : "Cambiar la configuración de la sala"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-violet-400/30 bg-slate-950/50 p-4">
      <p className="flex items-center gap-2 font-display font-semibold text-slate-100">
        <Settings2 className="h-4 w-4 text-violet-300" /> Configuración de la sala
      </p>
      <SettingsFields settings={settings} value={draft} onChange={setDraft} editing />
      {problem && <p className="text-sm text-amber-300/90">{problem}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm text-slate-300 transition hover:text-slate-100"
        >
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={saving || problem !== null} className={`flex-1 ${PRIMARY_BUTTON}`}>
          {saving ? "Guardando…" : "Guardar para todos"}
        </button>
      </div>
    </div>
  );
}
