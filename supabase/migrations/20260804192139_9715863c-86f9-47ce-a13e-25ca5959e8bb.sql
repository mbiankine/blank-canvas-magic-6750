
-- Adicionar coluna service_name em customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS service_name TEXT;

-- Adicionar coluna default_message em whatsapp_settings
ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS default_message TEXT;

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;

-- Atualizar o trigger trg_generate_charges para incluir {servico}
-- Primeiro vamos ver o nome exato da função do trigger
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%generate_charges%';
