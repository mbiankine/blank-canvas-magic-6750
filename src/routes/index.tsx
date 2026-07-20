import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bem-vindo — Comece a construir" },
      {
        name: "description",
        content: "Um ponto de partida limpo para o seu próximo projeto. Diga o que quer construir.",
      },
      { property: "og:title", content: "Bem-vindo — Comece a construir" },
      {
        property: "og:description",
        content: "Um ponto de partida limpo para o seu próximo projeto.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, oklch(0.9 0.08 260 / 0.35), transparent 70%), radial-gradient(40% 40% at 80% 100%, oklch(0.85 0.1 30 / 0.25), transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          Pronto para construir
        </span>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Sua próxima ideia começa aqui.
        </h1>
        <p className="mt-5 text-pretty text-lg text-muted-foreground">
          Descreva o que você quer criar no chat — uma landing page, um app, um portfólio — e eu construo para você.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://docs.lovable.dev"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ver documentação
          </a>
          <span className="text-sm text-muted-foreground">
            ou digite seu pedido no chat →
          </span>
        </div>
      </div>
    </main>
  );
}
