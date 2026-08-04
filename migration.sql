-- Adicionar coluna service_name em customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS service_name TEXT;

-- Adicionar coluna default_message em whatsapp_settings
ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS default_message TEXT;

-- Garantir que as permissões continuem válidas (embora colunas novas geralmente herdem)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
