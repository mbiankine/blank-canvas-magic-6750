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
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setForm({ name: "", document: "", phone: "", email: "" });
    setEditingId(null);
  };

  const { data: companies, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });

  const saveCompany = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sessão expirada.");
      const payload = {
        name: form.name.trim(),
        document: form.document.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      };
      const { error } = editingId
        ? await supabase.from("companies").update(payload).eq("id", editingId)
        : await supabase.from("companies").insert({ user_id: userData.user.id, ...payload });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(editingId ? "Empresa atualizada." : "Empresa cadastrada.");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
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
      resetForm();
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
          <CardTitle>{editingId ? "Editar empresa" : "Nova empresa"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveCompany.mutate();
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
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saveCompany.isPending}>
                {editingId ? "Salvar alterações" : "Cadastrar empresa"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
            </div>
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
                <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingId(company.id);
                    setForm({
                      name: company.name ?? "",
                      document: company.document ?? "",
                      phone: company.phone ?? "",
                      email: company.email ?? "",
                    });
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeCompany.mutate(company.id)}
                  disabled={removeCompany.isPending}
                >
                  Remover
                </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
