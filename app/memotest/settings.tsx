"use client";

import {
  DEFAULT_RULES,
  MAX_PAIRS,
  MAX_TEXT_LENGTH,
  MEMO_SIZES,
  MIN_PAIRS,
  TURN_SECONDS_OPTIONS,
  createMemotestRoom,
  normalizeMeta,
  updateMemotestSettings,
  type CreateMemoParams,
  type DeckKind,
  type MemoRules,
} from "@/lib/memotest";
import { EMOJI_THEMES, type TextPair } from "@/lib/memotestDecks";
import PhotoPicker from "@/components/memotest/PhotoPicker";
import TextPairsEditor from "@/components/memotest/TextPairsEditor";
import type { GameSettings } from "@/components/RoomSettings";
import { SECTION_LABEL, chipClass, segmentClass } from "@/components/ui";

type Settings = {
  kind: DeckKind;
  theme: string;
  pairs: number;
  /** New photos to upload; empty keeps `images` (the room's current ones, when editing). */
  files: File[];
  images: string[];
  textPairs: TextPair[];
  rules: MemoRules;
};

const DECK_KINDS: { id: DeckKind; label: string }[] = [
  { id: "emoji", label: "😀 Emojis" },
  { id: "fotos", label: "📷 Fotos" },
  { id: "texto", label: "🔤 Texto" },
];

const filledText = (v: Settings) => v.textPairs.filter((p) => p.a.trim() && p.b.trim());

function params(v: Settings): CreateMemoParams {
  if (v.kind === "fotos") return { kind: "fotos", files: v.files, rules: v.rules };
  if (v.kind === "texto") return { kind: "texto", textPairs: filledText(v), rules: v.rules };
  return { kind: "emoji", theme: v.theme, pairs: v.pairs, rules: v.rules };
}

const emptyPairs = () => Array.from({ length: MIN_PAIRS }, () => ({ a: "", b: "" }));

export const SETTINGS: GameSettings<Settings> = {
  game: "memotest",
  initial: {
    kind: "emoji",
    theme: EMOJI_THEMES[0].id,
    pairs: MEMO_SIZES[0].pairs,
    files: [],
    images: [],
    textPairs: emptyPairs(),
    rules: DEFAULT_RULES,
  },
  fields: [
    {
      kind: "choice",
      key: "kind",
      label: "Cartas",
      layout: "segment",
      options: DECK_KINDS.map((k) => ({ value: k.id, label: k.label })),
    },
    {
      kind: "choice",
      key: "theme",
      label: "Tema",
      show: (v) => v.kind === "emoji",
      options: EMOJI_THEMES.map((t) => ({ value: t.id, label: t.label })),
    },
    {
      kind: "choice",
      key: "pairs",
      label: "Tamaño del tablero",
      show: (v) => v.kind === "emoji",
      options: MEMO_SIZES.map((s) => ({ value: s.pairs, label: s.label, sub: `${s.pairs} pares` })),
    },
    {
      kind: "custom",
      show: (v) => v.kind === "fotos",
      render: (v, set) => (
        <div className="flex flex-col gap-2">
          {v.images.length > 0 && v.files.length === 0 && (
            <p className="text-xs text-slate-400">
              La sala tiene {v.images.length} fotos. Si subís otras, reemplazan a esas.
            </p>
          )}
          <PhotoPicker files={v.files} onChange={(files) => set({ files })} max={MAX_PAIRS} />
        </div>
      ),
    },
    {
      kind: "custom",
      show: (v) => v.kind === "texto",
      render: (v, set) => (
        <div>
          <p className={SECTION_LABEL}>
            Pares ({MIN_PAIRS} a {MAX_PAIRS})
          </p>
          <p className="mb-2 text-xs text-slate-400">
            Cada par son dos cartas distintas que van juntas: país ↔ capital, palabra ↔ traducción…
          </p>
          <TextPairsEditor pairs={v.textPairs} onChange={(textPairs) => set({ textPairs })} max={MAX_PAIRS} maxLength={MAX_TEXT_LENGTH} />
        </div>
      ),
    },
    {
      kind: "custom",
      render: (v, set) => {
        const setRule = (patch: Partial<MemoRules>) => set({ rules: { ...v.rules, ...patch } });
        return (
          <div className="flex flex-col gap-4">
            <div>
              <p className={SECTION_LABEL}>Modo de juego</p>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-800/60 p-1">
                <button type="button" onClick={() => setRule({ mode: "turnos" })} className={segmentClass(v.rules.mode === "turnos")}>
                  🔁 Por turnos
                </button>
                <button type="button" onClick={() => setRule({ mode: "colab" })} className={segmentClass(v.rules.mode === "colab")}>
                  🤝 Cooperativo
                </button>
              </div>
              {v.rules.mode === "colab" && (
                <p className="mt-2 text-xs text-slate-400">
                  Todos dan vuelta cartas a la vez y comparten el tablero. ¡Resuélvanlo en el menor tiempo posible!
                </p>
              )}
            </div>
            {v.rules.mode === "turnos" && (
              <>
                <div>
                  <p className={SECTION_LABEL}>Si acertás un par…</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => setRule({ extraTurn: true })} className={chipClass(v.rules.extraTurn)}>
                      Seguís jugando
                    </button>
                    <button type="button" onClick={() => setRule({ extraTurn: false })} className={chipClass(!v.rules.extraTurn)}>
                      Pasa el turno igual
                    </button>
                  </div>
                </div>
                <div>
                  <p className={SECTION_LABEL}>Tiempo por turno</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TURN_SECONDS_OPTIONS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setRule({ turnSeconds: sec })}
                        className={chipClass(v.rules.turnSeconds === sec)}
                      >
                        {sec === 0 ? "Sin límite" : `${sec} s`}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      },
    },
  ],
  problem: (v) => {
    const photos = v.files.length || v.images.length;
    if (v.kind === "fotos" && photos < MIN_PAIRS) return `Subí al menos ${MIN_PAIRS} fotos (tenés ${photos}).`;
    const filled = filledText(v).length;
    if (v.kind === "texto" && filled < MIN_PAIRS) return `Completá al menos ${MIN_PAIRS} pares (tenés ${filled}).`;
    if (v.kind === "texto" && filled < v.textPairs.length) return "Hay pares con un lado vacío: completalos o quitalos.";
    return null;
  },
  create: (v, hostId) => createMemotestRoom(params(v), hostId),
  save: (roomId, v) => updateMemotestSettings(roomId, params(v), v.images),
  fromMeta: (meta) => {
    const c = normalizeMeta(meta);
    return {
      kind: c.kind,
      theme: c.theme,
      pairs: c.kind === "emoji" ? c.pairs : MEMO_SIZES[0].pairs,
      files: [],
      images: c.images,
      textPairs: c.textPairs.length ? c.textPairs : emptyPairs(),
      rules: c.rules,
    };
  },
};
