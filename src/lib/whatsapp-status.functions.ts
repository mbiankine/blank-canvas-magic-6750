import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type WorkerInfo = {
  configured: boolean;
  baseUrl: string | null;
  connected: boolean | null;
  status: string;
  raw: string | null;
  qrImage: string | null;
  qrText: string | null;
  error: string | null;
};

function baseFrom(apiUrl: string) {
  return apiUrl.trim().replace(/\/+$/, "").replace(/\/send$/, "");
}

/** Consulta status de pareamento e QR code do Worker Baileys (evita CORS no browser). */
export const getWorkerStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkerInfo> => {
    const { supabase, userId } = context;

    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_token")
      .eq("user_id", userId)
      .maybeSingle();

    const empty: WorkerInfo = {
      configured: false,
      baseUrl: null,
      connected: null,
      status: "não configurado",
      raw: null,
      qrImage: null,
      qrText: null,
      error: null,
    };

    if (!settings?.api_url) return empty;

    const base = baseFrom(settings.api_url);
    const headers: Record<string, string> = settings.api_token
      ? {
          Authorization: settings.api_token.startsWith("Bearer ") ? settings.api_token : `Bearer ${settings.api_token}`,
          "x-worker-token": settings.api_token.replace(/^Bearer\s+/i, ""),
        }
      : {};

    const info: WorkerInfo = { ...empty, configured: true, baseUrl: base, status: "desconhecido" };

    try {
      const res = await fetch(`${base}/status`, { headers });
      const text = (await res.text()).slice(0, 2000);
      info.raw = text;
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const connected =
          json['connected'] ?? json['isConnected'] ?? json['ready'] ?? json['online'];
        if (typeof connected === "boolean") info.connected = connected;
        const state = json['status'] ?? json['state'] ?? json['connection'];
        if (typeof state === "string") {
          info.status = state;
          if (info.connected === null) info.connected = /open|connected|ready/i.test(state);
        } else if (info.connected !== null) {
          info.status = info.connected ? "conectado" : "desconectado";
        }
      } catch {
        info.status = res.ok ? "online" : `erro ${res.status}`;
      }
    } catch (error) {
      info.error = error instanceof Error ? error.message : "Worker inacessível.";
      info.status = "offline";
    }

    if (info.connected !== true) {
      try {
        const res = await fetch(`${base}/qr`, { headers });
        const contentType = res.headers.get("content-type") ?? "";
        
        if (res.ok && contentType.startsWith("image/")) {
          const buffer = await res.arrayBuffer();
          const b64 = Buffer.from(buffer).toString("base64");
          info.qrImage = `data:${contentType.split(";")[0]};base64,${b64}`;
        } else {
          const text = (await res.text()).trim();
          if (text.startsWith("data:image")) {
            info.qrImage = text;
          } else if (text.startsWith("{")) {
            const json = JSON.parse(text) as Record<string, unknown>;
            const qr = json['qr'] ?? json['qrcode'] ?? json['base64'] ?? json['image'];
            if (typeof qr === "string") {
              info.qrImage = qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
            }
          } else if (text.includes("<img")) {
            const match = text.match(/src=["'](data:image[^"']+)["']/);
            if (match) info.qrImage = match[1];
          } else if (text && text.length > 50) {
             // Se o texto for longo e não for JSON, pode ser o QR puro em base64
             info.qrImage = text.startsWith("data:") ? text : `data:image/png;base64,${text}`;
          } else if (text) {
            info.qrText = text.slice(0, 4000);
          }
        }
      } catch (e) {
        console.error("Erro ao buscar QR do worker:", e);
      }
    }

    return info;
  });
