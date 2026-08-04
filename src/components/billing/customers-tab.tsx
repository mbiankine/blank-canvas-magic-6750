import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { normalizeBrPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_MESSAGE =
  "Olá {cliente}, sua cobrança de {valor} referente ao serviço {servico} vence em {vencimento}. Qualquer dúvida, é só responder aqui.";

const emptyForm = {
  company_id: "",
  name: "",
  whatsapp: "",
  service_name: "",
  amount: "",
  months: "1",
  start_date: new Date().toISOString().slice(0, 10),
  custom_message: "",
};

export function CustomersTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const insertVariable = (variable: string) => {
    setForm((prev) => ({
      ...prev,
      custom_message: prev.custom_message + variable,
    }));
  };
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, phone")
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["whatsapp_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_settings")
        .select("default_message")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*, companies(name)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const createCustomer = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const amount = Number(form.amount.replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Informe um valor válido.");
      if (!form.company_id) throw new Error("Selecione uma empresa.");

      const { error } = await supabase.from("customers").insert({
        user_id: userData.user.id,
        company_id: form.company_id,
        name: form.name.trim(),
        whatsapp: normalizeBrPhone(form.whatsapp),
        service_name: form.service_name.trim(),
        amount,
        months: Number(form.months),
        start_date: form.start_date,
        custom_message: form.custom_message.trim() || settings?.default_message || DEFAULT_MESSAGE,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado e cobranças geradas.");
      setForm({ ...emptyForm, company_id: form.company_id });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["charges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cliente removido.");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["charges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Novo cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createCustomer.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Empresa *</Label>
              <Select
                value={form.company_id}
                onValueChange={(value) => {
                  const company = companies?.find((item) => item.id === value);
                  const companyPhone = normalizeBrPhone(company?.phone ?? "");
                  setForm((prev) => ({
                    ...prev,
                    company_id: value,
                    whatsapp: companyPhone || prev.whatsapp,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies?.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!companies?.length && (
                <p className="text-xs text-muted-foreground">Cadastre uma empresa primeiro.</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-name">Nome *</Label>
                <Input
                  id="customer-name"
                  required
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-whatsapp">WhatsApp *</Label>
                <Input
                  id="customer-whatsapp"
                  required
                  placeholder="5511999999999"
                  maxLength={20}
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Pode digitar só DDD + número; o 55 é adicionado automaticamente.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-service">Serviço *</Label>
                <Input
                  id="customer-service"
                  required
                  placeholder="Ex: Servidor de Bot, Designer..."
                  value={form.service_name}
                  onChange={(e) => setForm({ ...form, service_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-amount">Valor (R$) *</Label>
                <Input
                  id="customer-amount"
                  required
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-months">Meses *</Label>
                <Input
                  id="customer-months"
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={form.months}
                  onChange={(e) => setForm({ ...form, months: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-start">Primeiro vencimento *</Label>
              <Input
                id="customer-start"
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-message">Mensagem personalizada</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { label: "Cliente", value: "{cliente}" },
                  { label: "Valor", value: "{valor}" },
                  { label: "Vencimento", value: "{vencimento}" },
                  { label: "Serviço", value: "{servico}" },
                ].map((variable) => (
                  <Button
                    key={variable.value}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="h-7 text-[10px] px-2"
                    onClick={() => insertVariable(variable.value)}
                  >
                    {variable.label}
                  </Button>
                ))}
              </div>
              <Textarea
                id="customer-message"
                rows={4}
                maxLength={1000}
                placeholder={settings?.default_message || DEFAULT_MESSAGE}
                value={form.custom_message}
                onChange={(e) => setForm({ ...form, custom_message: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Clique nos botões acima para inserir variáveis.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={createCustomer.isPending}>
              Cadastrar cliente
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !customers?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado ainda.</p>
          ) : (
            customers.map((customer) => (
              <div
                key={customer.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {customer.name}{" "}
                    <span className="text-sm text-muted-foreground">
                      · {customer.companies?.name}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {customer.whatsapp} · {customer.service_name} · R$ {Number(customer.amount).toFixed(2)} ·{" "}
                    {customer.months}x
                  </p>
                  <p className="text-xs text-muted-foreground">{customer.custom_message}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeCustomer.mutate(customer.id)}
                  disabled={removeCustomer.isPending}
                >
                  Remover
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
