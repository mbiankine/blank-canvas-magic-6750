import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Webhook público chamado pelo Worker WhatsApp (Railway).
 * O Worker deve enviar:
 *   POST <LOVABLE_WEBHOOK_URL>
 *   Authorization: Bearer <WORKER_TOKEN>
 *   { "chargeId": "uuid", "status": "sent" | "delivered" | "failed" | "paid", "detail": "opcional" }
 */
const payloadSchema = z.object({
  chargeId: z.string().uuid(),
  status: z.enum(["sent", "delivered", "failed", "paid"]),
  detail: z.string().max(1000).optional(),
});

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


        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "Payload inválido" }), {
            status: 400,
            headers: jsonHeaders,
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
