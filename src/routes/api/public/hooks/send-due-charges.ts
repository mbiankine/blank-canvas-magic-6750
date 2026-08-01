import { createFileRoute } from "@tanstack/react-router";

import { normalizeBrPhone } from "@/lib/phone";

const jsonHeaders = { "Content-Type": "application/json" } as const;

/** Data/hora atual no fuso de São Paulo (usado para comparar com send_time). */
function nowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(time: string) {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/** Executado a cada 5 min pelo cron: envia as cobranças do dia no horário configurado. */
export const Route = createFileRoute("/api/public/hooks/send-due-charges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { date, minutes } = nowInSaoPaulo();

        const { data: settingsRows, error: settingsError } = await supabaseAdmin
          .from("whatsapp_settings")
          .select("user_id, api_url, api_token, instance, send_time");
        if (settingsError) {
          return new Response(JSON.stringify({ error: settingsError.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        let sent = 0;
        const failures: string[] = [];

        for (const settings of settingsRows ?? []) {
          if (!settings.api_url) continue;
          const target = toMinutes((settings.send_time ?? "09:00").slice(0, 5));
          // Janela de 5 min (frequência do cron), sem reenviar em execuções seguintes.
          if (minutes < target || minutes >= target + 5) continue;

          const { data: charges } = await supabaseAdmin
            .from("charges")
            .select("id, message, customers(whatsapp)")
            .eq("user_id", settings.user_id)
            .eq("status", "pending")
            .lte("due_date", date);

          const base = settings.api_url.trim().replace(/\/+$/, "");
          const sendUrl = base.endsWith("/send") ? base : `${base}/send`;

          for (const charge of charges ?? []) {
            const phone = normalizeBrPhone(charge.customers?.whatsapp ?? "");
            const logEvent = (event_type: "sent" | "failed", detail: string) =>
              supabaseAdmin.from("charge_events").insert({
                user_id: settings.user_id,
                charge_id: charge.id,
                event_type,
                detail,
                phone,
                message: charge.message,
              });

            if (!phone) {
              await logEvent("failed", "Cliente sem número de WhatsApp válido.");
              continue;
            }
            try {
              const response = await fetch(sendUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(settings.api_token
                    ? {
                        Authorization: `Bearer ${settings.api_token}`,
                        "x-worker-token": settings.api_token,
                      }
                    : {}),
                },
                body: JSON.stringify({
                  instance: settings.instance ?? undefined,
                  phone,
                  number: phone,
                  message: charge.message,
                }),
              });
              if (!response.ok) {
                const body = (await response.text()).trim().slice(0, 300);
                failures.push(`${charge.id}: ${response.status}`);
                await logEvent("failed", `Envio automático falhou [${response.status}]: ${body}`);
                continue;
              }
              await supabaseAdmin
                .from("charges")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", charge.id);
              await logEvent("sent", `Enviada automaticamente para ${phone}.`);
              sent += 1;
            } catch (error) {
              failures.push(`${charge.id}: ${(error as Error).message}`);
              await logEvent("failed", `Envio automático falhou: ${(error as Error).message}`);
            }
          }
        }

        return new Response(JSON.stringify({ ok: true, sent, failures }), {
          status: 200,
          headers: jsonHeaders,
        });
      },
    },
  },
});
