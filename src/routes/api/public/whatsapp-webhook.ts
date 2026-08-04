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
          
          // Tenta encontrar comando com ID primeiro
          const idMatch = trimmedText.match(ID_COMMAND_REGEX);
          let targetChargeId: string | null = null;
          let targetStatus: "paid" | "pending" | null = null;

          if (idMatch) {
            const shortId = parseInt(idMatch[1], 10);
            const command = idMatch[2].toLowerCase();
            
            targetStatus = ["pendente", "aberto", "fatura pendente"].includes(command) 
              ? "pending" 
              : "paid";

            // Busca a cobrança pelo short_id e pelo número de telefone (segurança)
            const digits = inboundPhoneRaw.replace(/\D/g, "");
            const suffix = digits.slice(-8);
            
            // Log para debug
            console.log(`Recebido comando de: ${digits}, shortId: ${shortId}, command: ${command}`);

            // Busca a cobrança pelo short_id
            const { data: charges } = await supabaseAdmin
              .from("charges")
              .select("id, customers:customers!inner(whatsapp), user_id")
              .eq("short_id", shortId);

            if (charges && charges.length > 0) {
              const charge = charges[0];
              const customersData = charge.customers as unknown as { whatsapp: string } | null;
              const customerWhatsapp = (customersData?.whatsapp || "").replace(/\D/g, "");
              
              // Verifica se o remetente é o cliente (compara os últimos 8 dígitos para ignorar o 9 extra ou DDI)
              const isCustomer = customerWhatsapp.length >= 8 && suffix.length >= 8 && digits.endsWith(customerWhatsapp.slice(-8));

              // Verifica se o remetente é o número mestre (62982503769) ou algum da empresa
              let isAdmin = suffix === "82503769" || suffix === "81645316";
              
              if (!isAdmin && !isCustomer) {
                const { data: companies } = await supabaseAdmin
                  .from("companies")
                  .select("phone")
                  .eq("user_id", charge.user_id);

                if (companies) {
                  isAdmin = companies.some(c => {
                    const companyPhone = (c.phone || "").replace(/\D/g, "");
                    return companyPhone.length >= 8 && digits.endsWith(companyPhone.slice(-8));
                  });
                }
              }

              if (isCustomer || isAdmin) {
                targetChargeId = charge.id;
              } else {
                console.log(`Acesso negado para o número ${digits} na cobrança ${shortId}`);
              }
            }
          } else {
            // Fallback: Lógica anterior (comando sem ID, busca a mais antiga)
            const isPaidCommand = PAID_COMMANDS.some((regex) => regex.test(trimmedText));
            const isPendingCommand = PENDING_COMMANDS.some((regex) => regex.test(trimmedText));

            if (isPaidCommand || isPendingCommand) {
              targetStatus = isPaidCommand ? "paid" : "pending";
              const digits = inboundPhoneRaw.replace(/\D/g, "");

              const { data: customers } = await supabaseAdmin
                .from("customers")
                .select("id, whatsapp")
                .like("whatsapp", `%${digits.slice(-8)}`);

              const customerIds = (customers ?? []).map((customer) => customer.id);
              if (customerIds.length) {
                const { data: charge } = await supabaseAdmin
                  .from("charges")
                  .select("id")
                  .in("customer_id", customerIds)
                  .neq("status", targetStatus)
                  .order("due_date", { ascending: true })
                  .limit(1)
                  .maybeSingle();

                if (charge) {
                  targetChargeId = charge.id;
                }
              }
            }
          }

          if (!targetChargeId || !targetStatus) {
            return new Response(JSON.stringify({ ok: true, ignored: true }), {
              status: 200,
              headers: jsonHeaders,
            });
          }

          const { error: updateError } = await supabaseAdmin
            .from("charges")
            .update({ status: targetStatus })
            .eq("id", targetChargeId);

          if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
              status: 500,
              headers: jsonHeaders,
            });
          }

          return new Response(
            JSON.stringify({ ok: true, chargeId: targetChargeId, status: targetStatus }),
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
