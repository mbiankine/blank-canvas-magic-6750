import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZapCobrança — Cobranças recorrentes no WhatsApp" },
      {
        name: "description",
        content:
          "Cadastre sua empresa, seus clientes e dispare cobranças mensais personalizadas pelo WhatsApp com Baileys.",
      },
      { property: "og:title", content: "ZapCobrança — Cobranças recorrentes no WhatsApp" },
      {
        property: "og:description",
        content:
          "Gere parcelas automáticas e envie mensagens personalizadas de cobrança pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
          Cobranças automáticas no WhatsApp
        </span>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Cobre seus clientes todo mês, sem esquecer nenhum.
        </h1>
        <p className="mt-5 text-pretty text-lg text-muted-foreground">
          Cadastre a empresa, o WhatsApp do cliente, o valor e a quantidade de meses. As parcelas e
          as mensagens personalizadas são geradas automaticamente.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Abrir painel
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Entrar / criar conta
          </Link>
        </div>
      </div>
    </main>
  );
}
