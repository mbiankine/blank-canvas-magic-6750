import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    api_url: "",
    api_token: "",
    instance: "",
    send_time: "09:00",
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

  return (
    <Card className="max-w-2xl">
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
          <Button type="submit" disabled={save.isPending}>
            Salvar configurações
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
