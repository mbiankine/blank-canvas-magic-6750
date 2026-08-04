import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkerStatus } from "@/lib/whatsapp-status.functions";

export function SettingsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    api_url: "",
    api_token: "",
    instance: "",
    send_time: "09:00",
    default_message: "",
  });

  const { data: settings } = useQuery({
    queryKey: ["whatsapp_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_settings")
        .select("*")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        api_url: settings.api_url ?? "",
        api_token: settings.api_token ?? "",
        instance: settings.instance ?? "",
        send_time: (settings.send_time ?? "09:00").slice(0, 5),
        default_message: settings.default_message ?? "",
      });
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("whatsapp_settings").upsert(
        {
          user_id: userData.user.id,
          api_url: form.api_url.trim(),
          api_token: form.api_token.trim() || null,
          instance: form.instance.trim() || null,
          send_time: form.send_time || "09:00",
          default_message: form.default_message.trim() || null,
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Configurações salvas.");
      queryClient.invalidateQueries({ queryKey: ["whatsapp_settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fetchWorkerStatus = useServerFn(getWorkerStatus);
  const worker = useQuery({
    queryKey: ["worker_status"],
    queryFn: () => fetchWorkerStatus(),
    refetchInterval: 15000,
  });

  const workerData = worker.data;

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Pareamento do WhatsApp</CardTitle>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              workerData?.connected === true
                ? "default"
                : workerData?.connected === false
                  ? "destructive"
                  : "secondary"
            }
          >
            {workerData?.connected === true
              ? "Conectado"
              : workerData
                ? (workerData.status ?? "desconhecido")
                : "—"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => worker.refetch()}
            disabled={worker.isFetching}
          >
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {worker.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !workerData?.configured ? (
          <p className="text-sm text-muted-foreground">
            Salve o endpoint do seu serviço para exibir o status e o QR code.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground break-all">
              Worker: {workerData.baseUrl}
            </p>
            {workerData.error && (
              <p className="text-sm text-destructive">{workerData.error}</p>
            )}
            {workerData.connected === true ? (
              <p className="text-sm text-muted-foreground">
                WhatsApp pareado — as cobranças podem ser enviadas.
              </p>
            ) : workerData.qrImage ? (
              <div className="space-y-2">
                <img
                  src={workerData.qrImage}
                  alt="QR code para parear o WhatsApp"
                  className="mx-auto h-64 w-64 rounded-lg border border-border bg-card p-2"
                />
                <p className="text-center text-xs text-muted-foreground">
                  WhatsApp → Aparelhos conectados → Conectar aparelho.
                </p>
              </div>
            ) : workerData.qrText ? (
              <pre className="overflow-auto rounded-lg border border-border bg-muted p-3 text-[8px] leading-[8px]">
                {workerData.qrText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum QR disponível no momento (rota /qr do worker). Reinicie o serviço se o
                pareamento estiver pendente.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Conexão WhatsApp (Baileys / Railway)</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="api-url">Endpoint de envio *</Label>
            <Input
              id="api-url"
              required
              placeholder="https://seu-app.up.railway.app/send"
              value={form.api_url}
              onChange={(e) => setForm({ ...form, api_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Rota POST do seu serviço Baileys que recebe {"{ phone, message }"}.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-token">Token (Bearer)</Label>
            <Input
              id="api-token"
              type="password"
              value={form.api_token}
              onChange={(e) => setForm({ ...form, api_token: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-instance">Instância</Label>
            <Input
              id="api-instance"
              value={form.instance}
              onChange={(e) => setForm({ ...form, instance: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="send-time">Horário de cobrança</Label>
            <Input
              id="send-time"
              type="time"
              value={form.send_time}
              onChange={(e) => setForm({ ...form, send_time: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Hora do dia usada para os envios das cobranças.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-message">Mensagem Padrão (Sugestão)</Label>
            <Textarea
              id="default-message"
              rows={4}
              placeholder="Olá {cliente}, sua cobrança de {valor} referente ao serviço {servico} vence em {vencimento}..."
              value={form.default_message}
              onChange={(e) => setForm({ ...form, default_message: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Esta mensagem será usada como sugestão no cadastro de novos clientes.
            </p>
          </div>
          <Button type="submit" disabled={save.isPending}>
            Salvar configurações
          </Button>
        </form>
      </CardContent>
    </Card>
    </div>
  );
}
