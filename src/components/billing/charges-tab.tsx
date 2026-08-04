import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Calendar, User, Building2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { sendCharge } from "@/lib/whatsapp.functions";
import { ChargeHistory } from "@/components/billing/charge-history";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviada",
  paid: "Paga",
  canceled: "Cancelada",
};

export function ChargesTab() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendCharge);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>("");

  const { data: charges, isLoading } = useQuery({
    queryKey: ["charges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("*, customers(id, name, whatsapp, companies(name))")
        .order("due_date", { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["charges"] });
    queryClient.invalidateQueries({ queryKey: ["charge-events"] });
  };

  const updateDateMutation = useMutation({
    mutationFn: async ({ id, dueDate, resetStatus }: { id: string; dueDate: string; resetStatus: boolean }) => {
      const updates: any = { due_date: dueDate };
      if (resetStatus) {
        updates.status = "pending";
      }
      
      const { error } = await supabase
        .from("charges")
        .update(updates)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Data de vencimento atualizada.");
      setEditingChargeId(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: async (chargeId: string) => send({ data: { chargeId } }),
    onSuccess: () => {
      toast.success("Cobrança enviada pelo WhatsApp.");
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("charges").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("charges").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cobrança removida.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("charges").delete().not("id", "is", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Todas as cobranças foram removidas.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!charges?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma cobrança gerada. Cadastre um cliente para começar.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Agrupar cobranças por cliente
  const groupedCharges = charges.reduce((acc: any, charge) => {
    const customerId = charge.customers?.id;
    if (!customerId) return acc;
    if (!acc[customerId]) {
      acc[customerId] = {
        customer: charge.customers,
        charges: [],
      };
    }
    acc[customerId].charges.push(charge);
    return acc;
  }, {});

  const customerGroups = Object.values(groupedCharges);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Cobranças</h2>
        <Button
          size="sm"
          variant="destructive"
          disabled={deleteAllMutation.isPending}
          onClick={() => {
            if (confirm("Remover todas as cobranças de todos os clientes?")) deleteAllMutation.mutate();
          }}
        >
          Limpar tudo
        </Button>
      </div>

      <div className="grid gap-4">
        {customerGroups.map((group: any) => {
          const isExpanded = expandedCustomerId === group.customer.id;
          const pendingCount = group.charges.filter((c: any) => c.status === "pending").length;

          return (
            <Card key={group.customer.id} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-accent/50 transition-colors py-4 px-6"
                onClick={() => setExpandedCustomerId(isExpanded ? null : group.customer.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{group.customer.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {group.customer.companies?.name}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          · {group.customer.whatsapp}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium">{group.charges.length} parcelas</p>
                      {pendingCount > 0 && (
                        <p className="text-xs text-orange-600 font-medium">{pendingCount} pendentes</p>
                      )}
                    </div>
                    <ChevronRight className={cn("h-5 w-5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0 border-t border-border">
                  <div className="divide-y divide-border">
                    {group.charges.map((charge: any) => {
                      const isEditing = editingChargeId === charge.id;
                      
                      return (
                        <div key={charge.id} className="p-4 hover:bg-accent/20 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <Badge variant={charge.status === "paid" ? "default" : charge.status === "sent" ? "outline" : "secondary"}>
                                {STATUS_LABEL[charge.status] || charge.status}
                              </Badge>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    Parcela {charge.installment} (ID {String(charge.short_id || "").padStart(2, "0")})
                                  </span>
                                  <span className="text-sm font-semibold">R$ {Number(charge.amount).toFixed(2)}</span>
                                </div>
                                
                                {isEditing ? (
                                  <div className="flex items-center gap-2 mt-2">
                                    <Input 
                                      type="date" 
                                      className="h-8 w-40 text-xs" 
                                      value={editDate}
                                      onChange={(e) => setEditDate(e.target.value)}
                                    />
                                    <Button 
                                      size="sm" 
                                      className="h-8 px-2"
                                      onClick={() => {
                                        const isFuture = new Date(editDate) > new Date();
                                        const shouldReset = isFuture && charge.status === "sent";
                                        updateDateMutation.mutate({ 
                                          id: charge.id, 
                                          dueDate: editDate, 
                                          resetStatus: shouldReset 
                                        });
                                      }}
                                    >
                                      Salvar
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      className="h-8 px-2"
                                      onClick={() => setEditingChargeId(null)}
                                    >
                                      Sair
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 group">
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3.5 w-3.5" />
                                      Vence em {new Date(`${charge.due_date}T00:00:00`).toLocaleDateString("pt-BR")}
                                    </p>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => {
                                        setEditingChargeId(charge.id);
                                        setEditDate(charge.due_date);
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}

                                {charge.sent_at && (
                                  <p className="text-[10px] text-muted-foreground italic">
                                    Enviada em {new Date(charge.sent_at).toLocaleString("pt-BR")}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {(charge.status === "pending" || charge.status === "sent") && (
                                <Button 
                                  size="sm" 
                                  className="h-8"
                                  onClick={() => sendMutation.mutate(charge.id)}
                                  disabled={sendMutation.isPending}
                                >
                                  {charge.status === "sent" ? "Reenviar WhatsApp" : "Enviar WhatsApp"}
                                </Button>
                              )}
                              {charge.status !== "paid" && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 text-xs"
                                  onClick={() => statusMutation.mutate({ id: charge.id, status: "paid" })}
                                >
                                  Pagar
                                </Button>
                              )}
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  if (confirm("Remover esta parcela?")) deleteMutation.mutate(charge.id);
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                              </Button>
                            </div>
                          </div>
                          
                          {/* Histórico e Detalhes da Mensagem (pode ser expandido aqui também se necessário) */}
                          <div className="mt-3 bg-muted/30 rounded p-3 text-xs hidden sm:block">
                            <p className="font-medium mb-1">Prévia da mensagem:</p>
                            <p className="text-muted-foreground whitespace-pre-wrap">{charge.message}</p>
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <ChargeHistory chargeId={charge.id} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
