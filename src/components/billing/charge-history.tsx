import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

export interface ChargeHistoryProps {
  chargeId: string;
}

const EVENT_LABEL: Record<string, string> = {
  sent: "Enviada",
  failed: "Falha no envio",
  status_changed: "Status alterado",
};

/** Linha do tempo dos envios/tentativas de uma cobrança. */
export function ChargeHistory({ chargeId }: ChargeHistoryProps) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["charge-events", chargeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charge_events")
        .select("*")
        .eq("charge_id", chargeId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  if (!events?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma tentativa de envio registrada para esta cobrança.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                event.event_type === "failed"
                  ? "text-sm font-medium text-destructive"
                  : "text-sm font-medium text-foreground"
              }
            >
              {EVENT_LABEL[event.event_type] ?? event.event_type}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString("pt-BR")}
            </span>
            {event.phone && (
              <span className="text-xs text-muted-foreground">· {event.phone}</span>
            )}
          </div>
          {event.detail && (
            <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
          )}
          {event.message && (
            <p className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs text-muted-foreground">
              {event.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
