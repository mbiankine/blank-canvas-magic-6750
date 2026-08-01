import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBrPhone } from "@/lib/phone";

const sendSchema = z.object({ chargeId: z.string().uuid() });

/** Envia a mensagem da cobrança usando o serviço Baileys do usuário (Railway). */
export const sendCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: charge, error: chargeError } = await supabase
      .from("charges")
      .select("id, message, status, customers(name, whatsapp)")
      .eq("id", data.chargeId)
      .maybeSingle();

    if (chargeError) throw new Error(chargeError.message);
    if (!charge) throw new Error("Cobrança não encontrada.");

    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_token, instance")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings?.api_url) {
      throw new Error("Configure a URL do seu serviço Baileys em Configurações.");
    }

    // O Worker expõe exatamente POST /send. Normaliza qualquer variação salva
    // (origem pura, barra final, espaços) para evitar 404 de rota inexistente.
    const sendUrl = (() => {
      const base = settings.api_url.trim().replace(/\/+$/, "");
      return base.endsWith("/send") ? base : `${base}/send`;
    })();

    const phone = normalizeBrPhone(charge.customers?.whatsapp ?? "");
    if (!phone) throw new Error("Cliente sem número de WhatsApp válido.");

    const logEvent = async (
      event_type: "sent" | "failed",
      detail: string | null,
    ) => {
      await supabase.from("charge_events").insert({
        user_id: userId,
        charge_id: charge.id,
        event_type,
        detail,
        phone,
        message: charge.message,
      });
    };

    const fail = async (message: string) => {
      await logEvent("failed", message);
      throw new Error(message);
    };

    let response: Response;
    try {
      response = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.api_token ? { Authorization: `Bearer ${settings.api_token}` } : {}),
        },
        body: JSON.stringify({
          instance: settings.instance ?? undefined,
          phone,
          number: phone,
          message: charge.message,
        }),
      });
    } catch (error) {
      await fail(`Não foi possível alcançar o Worker em ${sendUrl}: ${(error as Error).message}`);
      throw error;
    }

    if (!response.ok) {
      const body = (await response.text()).trim();
      if (response.status === 404) {
        if (body.includes("numero_nao_esta_no_whatsapp")) {
          await fail(`O número ${phone} não está registrado no WhatsApp.`);
        }
        await fail(
          `Rota não encontrada no Worker (404) em ${sendUrl}. ` +
            `Confirme o domínio do Railway e que o serviço está online (teste GET /status).`,
        );
      }
      if (response.status === 503) {
        await fail("Worker online, mas o WhatsApp não está conectado. Escaneie o QR em /qr.");
      }
      await fail(`Falha no envio [${response.status}] em ${sendUrl}: ${body.slice(0, 300)}`);
    }

    const { error: updateError } = await supabase
      .from("charges")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", charge.id);
    if (updateError) throw new Error(updateError.message);

    await logEvent("sent", `Enviada manualmente para ${phone}.`);

    return { ok: true as const };
  });
