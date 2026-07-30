import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

async function fetchCompanies() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export function CompaniesTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", document: "", phone: "", email: "" });

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });

  const createCompany = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("companies").insert({
        user_id: userData.user.id,
        name: form.name.trim(),
        document: form.document.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Empresa cadastrada.");
      setForm({ name: "", document: "", phone: "", email: "" });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Empresa removida.");
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["charges"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Nova empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createCompany.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="company-name">Nome *</Label>
              <Input
                id="company-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-doc">CNPJ / CPF</Label>
              <Input
                id="company-doc"
                maxLength={30}
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-phone">Telefone</Label>
              <Input
                id="company-phone"
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-email">E-mail</Label>
              <Input
                id="company-email"
                type="email"
                maxLength={160}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createCompany.isPending}>
              Cadastrar empresa
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empresas cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !companies?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            companies.map((company) => (
              <div
                key={company.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div>
                  <p className="font-medium text-foreground">{company.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[company.document, company.phone, company.email].filter(Boolean).join(" · ") ||
                      "Sem dados adicionais"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeCompany.mutate(company.id)}
                  disabled={removeCompany.isPending}
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
