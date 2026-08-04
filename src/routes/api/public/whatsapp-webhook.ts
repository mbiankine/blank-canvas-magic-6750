import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Webhook público chamado pelo Worker WhatsApp (Railway).
 * O Worker deve enviar:
 *   POST <LOVABLE_WEBHOOK_URL>
 *   Authorization: Bearer <WORKER_TOKEN>
 *   { "chargeId": "uuid", "status": "sent" | "delivered" | "failed" | "paid", "detail": "opcional" }
 */
const statusSchema = z.object({
  chargeId: z.string().uuid(),
  status: z.enum(["sent", "delivered", "failed", "paid"]),
  detail: z.string().max(1000).optional(),
});

/**
 * Mensagem recebida no WhatsApp encaminhada pelo Worker:
 *   { "from": "5511999999999", "message": "*recebido" }
 * Comandos reconhecidos: recebido / pago / paguei (com ou sem *).
 */
const inboundSchema = z.object({
  from: z.string().min(8).max(30).optional(),
  phone: z.string().min(8).max(30).optional(),
  number: z.string().min(8).max(30).optional(),
  message: z.string().max(2000).optional(),
  text: z.string().max(2000).optional(),
  body: z.string().max(2000).optional(),
});

const PAID_COMMANDS = [
  /^[\s*_~]*(recebido|pago|paguei|quitado|fatura\s*paga|fatura\s*pago)[\s*_~!.]*$/i,
];
const PENDING_COMMANDS = [
  /^[\s*_~]*(pendente|aberto|fatura\s*pendente)[\s*_~!.]*$/i,
];

// Regex para capturar comandos com ID, ex: "id 01 pago", "id 15 recebido", "*id 01 pago*"
const ID_COMMAND_REGEX = /^[\s*_~]*id\s*(\d+)\s*(recebido|pago|paguei|quitado|fatura\s*paga|fatura\s*pago|pendente|aberto|fatura\s*pendente)[\s*_~!.]*$/i;


const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: jsonHeaders }),
      POST: async ({ request }) => {
        const expected = process.env["WORKER_TOKEN"];
        if (!expected) {
          return new Response(JSON.stringify({ error: "WORKER_TOKEN não configurado" }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        // Aceita tanto `Authorization: Bearer <token>` quanto `x-worker-token: <token>`.
        const provided = (
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          request.headers.get("x-worker-token") ??
          ""
        ).trim();
        if (provided.length !== expected.length || provided !== expected) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: jsonHeaders,
          });
        }


        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Payload inválido" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Caminho 1: mensagem recebida do cliente (comando *recebido).
        const inbound = inboundSchema.safeParse(raw);
        const inboundText =
          inbound.success
            ? (inbound.data.message ?? inbound.data.text ?? inbound.data.body ?? "")
            : "";
        const inboundPhoneRaw = inbound.success
          ? (inbound.data.from ?? inbound.data.phone ?? inbound.data.number ?? "")
          : "";

        if (inboundText && inboundPhoneRaw) {
          const trimmedText = inboundText.trim();
          const isPaidCommand = PAID_COMMANDS.some((regex) => regex.test(trimmedText));
          const isPendingCommand = PENDING_COMMANDS.some((regex) => regex.test(trimmedText));

          if (!isPaidCommand && !isPendingCommand) {
            return new Response(JSON.stringify({ ok: true, ignored: true }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          const targetStatus = isPaidCommand ? "paid" : "pending";
          const digits = inboundPhoneRaw.split("@")[0].replace(/\D/g, "");
          const suffix = digits.slice(-8);

          const { data: customers } = await supabaseAdmin
            .from("customers")
            .select("id, whatsapp")
            .like("whatsapp", `%${suffix}`);

          const customerIds = (customers ?? []).map((customer) => customer.id);
          if (!customerIds.length) {
            return new Response(JSON.stringify({ ok: true, matched: false }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          // Busca a cobrança mais antiga que ainda não está no status desejado
          const { data: charge } = await supabaseAdmin
            .from("charges")
            .select("id")
            .in("customer_id", customerIds)
            .neq("status", targetStatus)
            .order("due_date", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!charge) {
            return new Response(JSON.stringify({ ok: true, matched: false }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          const { error: updateError } = await supabaseAdmin
            .from("charges")
            .update({ status: targetStatus })
            .eq("id", charge.id);

          if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
              status: 500,
              headers: jsonHeaders,
            });
          }

          return new Response(
            JSON.stringify({ ok: true, chargeId: charge.id, status: targetStatus }),
            {
              status: 200,
              headers: jsonHeaders,
            },
          );
        }

        // Caminho 2: atualização de status de uma cobrança específica.
        let parsed: z.infer<typeof statusSchema>;
        try {
          parsed = statusSchema.parse(raw);
        } catch {
          return new Response(JSON.stringify({ error: "Payload inválido" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { error } = await supabaseAdmin
          .from("charges")
          .update({
            status: parsed.status,
            ...(parsed.status === "sent" || parsed.status === "delivered"
              ? { sent_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", parsed.chargeId);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: jsonHeaders,
          });
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
      },
    },
  },
});
