"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createMemotestRoom,
  DEFAULT_RULES,
  MAX_PAIRS,
  MAX_TEXT_LENGTH,
  MEMO_SIZES,
  MIN_PAIRS,
  TURN_SECONDS_OPTIONS,
  type CreateMemoParams,
  type DeckKind,
  type MemoRules,
} from "@/lib/memotest";
import { EMOJI_THEMES, type TextPair } from "@/lib/memotestDecks";
import { roomPath } from "@/lib/games";
import GameLobby from "@/components/GameLobby";
import PhotoPicker from "@/components/memotest/PhotoPicker";
import TextPairsEditor from "@/components/memotest/TextPairsEditor";
import { CARD, PRIMARY_BUTTON, SECTION_LABEL, chipClass, segmentClass } from "@/components/ui";

const DECK_KINDS: { id: DeckKind; label: string }[] = [
  { id: "emoji", label: "😀 Emojis" },
  { id: "fotos", label: "📷 Fotos" },
  { id: "texto", label: "🔤 Texto" },
];

export default function MemotestHome() {
  const router = useRouter();

  const [kind, setKind] = useState<DeckKind>("emoji");
  const [theme, setTheme] = useState(EMOJI_THEMES[0].id);
  const [pairs, setPairs] = useState<number>(MEMO_SIZES[0].pairs);
  const [files, setFiles] = useState<File[]>([]);
  const [textPairs, setTextPairs] = useState<TextPair[]>(
    Array.from({ length: MIN_PAIRS }, () => ({ a: "", b: "" }))
  );
  const [rules, setRules] = useState<MemoRules>(DEFAULT_RULES);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const filledText = textPairs.filter((p) => p.a.trim() && p.b.trim());
  const deckProblem =
    kind === "fotos" && files.length < MIN_PAIRS
      ? `Subí al menos ${MIN_PAIRS} fotos (tenés ${files.length}).`
      : kind === "texto" && filledText.length < MIN_PAIRS
        ? `Completá al menos ${MIN_PAIRS} pares (tenés ${filledText.length}).`
        : kind === "texto" && filledText.length < textPairs.length
          ? "Hay pares con un lado vacío: completalos o quitalos."
          : null;

  const setRule = (patch: Partial<MemoRules>) => setRules((r) => ({ ...r, ...patch }));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (deckProblem) return;
    setCreating(true);
    setCreateError(null);
    const params: CreateMemoParams =
      kind === "fotos"
        ? { kind, files, rules }
        : kind === "texto"
          ? { kind, textPairs: filledText, rules }
          : { kind, theme, pairs, rules };
    try {
      const roomId = await createMemotestRoom(params);
      router.push(roomPath("memotest", roomId));
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof Error ? err.message : "No se pudo crear la sala. Probá de nuevo.");
      setCreating(false);
    }
  };

  return (
    <GameLobby
      game="memotest"
      description="Dá vuelta las cartas de a dos y encontrá los pares. Con emojis, tus propias fotos o pares de texto, por turnos o todos juntos contra reloj."
    >
      <form onSubmit={handleCreate} className={`${CARD} flex flex-col gap-4`}>
        <h2 className="font-display text-lg font-semibold text-slate-100">Crear una sala nueva</h2>

        <div>
          <p className={SECTION_LABEL}>Cartas</p>
          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-800/60 p-1">
            {DECK_KINDS.map((k) => (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} className={segmentClass(kind === k.id)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {kind === "emoji" && (
          <>
            <div>
              <p className={SECTION_LABEL}>Tema</p>
              <div className="grid grid-cols-3 gap-1.5">
                {EMOJI_THEMES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTheme(t.id)} className={chipClass(theme === t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={SECTION_LABEL}>Tamaño del tablero</p>
              <div className="grid grid-cols-3 gap-1.5">
                {MEMO_SIZES.map((s) => (
                  <button key={s.label} type="button" onClick={() => setPairs(s.pairs)} className={chipClass(pairs === s.pairs)}>
                    {s.label}
                    <div className="text-[10px] font-normal text-slate-500">{s.pairs} pares</div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {kind === "fotos" && <PhotoPicker files={files} onChange={setFiles} max={MAX_PAIRS} />}

        {kind === "texto" && (
          <div>
            <p className={SECTION_LABEL}>Pares ({MIN_PAIRS} a {MAX_PAIRS})</p>
            <p className="mb-2 text-xs text-slate-400">
              Cada par son dos cartas distintas que van juntas: país ↔ capital, palabra ↔ traducción…
            </p>
            <TextPairsEditor pairs={textPairs} onChange={setTextPairs} max={MAX_PAIRS} maxLength={MAX_TEXT_LENGTH} />
          </div>
        )}

        <div>
          <p className={SECTION_LABEL}>Modo de juego</p>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-800/60 p-1">
            <button type="button" onClick={() => setRule({ mode: "turnos" })} className={segmentClass(rules.mode === "turnos")}>
              🔁 Por turnos
            </button>
            <button type="button" onClick={() => setRule({ mode: "colab" })} className={segmentClass(rules.mode === "colab")}>
              🤝 Cooperativo
            </button>
          </div>
          {rules.mode === "colab" && (
            <p className="mt-2 text-xs text-slate-400">
              Todos dan vuelta cartas a la vez y comparten el tablero. ¡Resuélvanlo en el menor tiempo posible!
            </p>
          )}
        </div>

        {rules.mode === "turnos" && (
          <>
            <div>
              <p className={SECTION_LABEL}>Si acertás un par…</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={() => setRule({ extraTurn: true })} className={chipClass(rules.extraTurn)}>
                  Seguís jugando
                </button>
                <button type="button" onClick={() => setRule({ extraTurn: false })} className={chipClass(!rules.extraTurn)}>
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
                    className={chipClass(rules.turnSeconds === sec)}
                  >
                    {sec === 0 ? "Sin límite" : `${sec} s`}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {deckProblem && <p className="text-sm text-amber-300/90">{deckProblem}</p>}
        {createError && <p className="text-sm text-red-400">{createError}</p>}

        <button type="submit" disabled={creating || deckProblem !== null} className={`mt-auto ${PRIMARY_BUTTON}`}>
          {creating ? (kind === "fotos" ? "Subiendo fotos…" : "Creando sala…") : "Crear sala"}
        </button>
      </form>
    </GameLobby>
  );
}
