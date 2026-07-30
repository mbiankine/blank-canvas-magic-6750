import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompaniesTab } from "@/components/billing/companies-tab";
import { CustomersTab } from "@/components/billing/customers-tab";
import { ChargesTab } from "@/components/billing/charges-tab";
import { SettingsTab } from "@/components/billing/settings-tab";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Painel de cobranças | ZapCobrança" },
      {
        name: "description",
        content:
          "Gerencie empresas, clientes, mensagens personalizadas e cobranças mensais enviadas por WhatsApp.",
      },
      { property: "og:title", content: "Painel de cobranças | ZapCobrança" },
      {
        property: "og:description",
        content: "Cadastre clientes e dispare cobranças recorrentes pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Painel de cobranças</h1>
          <p className="text-sm text-muted-foreground">
            Empresas, clientes e cobranças recorrentes via WhatsApp.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sair
        </Button>
      </header>

      <Tabs defaultValue="companies" className="space-y-6">
        <TabsList>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="companies">
          <CompaniesTab />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab />
        </TabsContent>
        <TabsContent value="charges">
          <ChargesTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
