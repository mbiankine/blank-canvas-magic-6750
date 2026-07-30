import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    const phone = (charge.customers?.whatsapp ?? "").replace(/\D/g, "");
    if (!phone) throw new Error("Cliente sem número de WhatsApp válido.");

    const response = await fetch(settings.api_url, {
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

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha no envio [${response.status}]: ${body.slice(0, 300)}`);
    }

    const { error: updateError } = await supabase
      .from("charges")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", charge.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const };
  });
