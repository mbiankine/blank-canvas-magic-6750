import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { sendCharge } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviada",
  paid: "Paga",
  canceled: "Cancelada",
};

export function ChargesTab() {
  const queryClient = useQueryClient();
  const send = useServerFn(sendCharge);

  const { data: charges, isLoading } = useQuery({
    queryKey: ["charges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select("*, customers(name, whatsapp, companies(name))")
        .order("due_date", { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["charges"] });

  const sendMutation = useMutation({
    mutationFn: async (chargeId: string) => send({ data: { chargeId } }),
    onSuccess: () => {
      toast.success("Cobrança enviada pelo WhatsApp.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Cobranças programadas</CardTitle>
        {!!charges?.length && (
          <Button
            size="sm"
            variant="destructive"
            disabled={deleteAllMutation.isPending}
            onClick={() => {
              if (confirm("Remover todas as cobranças?")) deleteAllMutation.mutate();
            }}
          >
            Remover todas
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !charges?.length ? (
          <p className="text-sm text-muted-foreground">
            Cadastre um cliente para gerar as cobranças mensais automaticamente.
          </p>
        ) : (
          charges.map((charge) => {
            const expanded = expandedId === charge.id;
            return (
              <div key={charge.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={expanded ? "Recolher histórico" : "Expandir histórico"}
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : charge.id)}
                    >
                      <ChevronRight
                        className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
                      />
                    </Button>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{charge.customers?.name}</p>
                        <Badge variant={charge.status === "pending" ? "secondary" : "default"}>
                          {STATUS_LABEL[charge.status] ?? charge.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Parcela {charge.installment}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Vence em{" "}
                        {new Date(`${charge.due_date}T00:00:00`).toLocaleDateString("pt-BR")} · R${" "}
                        {Number(charge.amount).toFixed(2)} · {charge.customers?.whatsapp}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {charge.sent_at
                          ? `Enviada em ${new Date(charge.sent_at).toLocaleString("pt-BR")}`
                          : "Ainda não enviada"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => sendMutation.mutate(charge.id)}
                      disabled={sendMutation.isPending}
                    >
                      Enviar agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id: charge.id, status: "paid" })}
                    >
                      Marcar paga
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (confirm("Remover esta cobrança?")) deleteMutation.mutate(charge.id);
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div>
                      <p className="text-xs font-medium text-foreground">Mensagem programada</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                        {charge.message}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">Histórico de envios</p>
                      <div className="mt-2">
                        <ChargeHistory chargeId={charge.id} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
