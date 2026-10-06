export default function FirebaseSetupNotice() {
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-slate-200 shadow-[0_0_30px_rgba(245,158,11,0.15)] backdrop-blur">
        <h1 className="font-display text-lg font-semibold text-amber-300">
          Falta configurar Firebase
        </h1>
        <p className="mt-2 text-sm">
          Esta app necesita un proyecto de Firebase (Realtime Database + Storage + Auth
          anónimo) para sincronizar las piezas en vivo. Completá{" "}
          <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-200">
            .env.local
          </code>{" "}
          con las credenciales de tu proyecto — mirá el{" "}
          <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-200">
            README.md
          </code>{" "}
          para el paso a paso, y después reiniciá{" "}
          <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs text-amber-200">
            npm run dev
          </code>
          .
        </p>
      </div>
    </div>
  );
}
