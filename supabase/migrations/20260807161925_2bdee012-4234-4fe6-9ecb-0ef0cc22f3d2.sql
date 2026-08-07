-- 1. Corrigir a função de geração de cobranças para não truncar IDs maiores que 99
CREATE OR REPLACE FUNCTION public.generate_charges_for_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i INTEGER;
  v_due DATE;
  v_msg TEXT;
  v_day INTEGER;
  v_month_start DATE;
  v_last_day INTEGER;
  v_charge_id UUID;
  v_short_id INTEGER;
  v_padded_id TEXT;
BEGIN
  v_day := EXTRACT(DAY FROM NEW.start_date)::int;

  FOR i IN 0..(NEW.months - 1) LOOP
    v_month_start := (date_trunc('month', NEW.start_date) + (i || ' month')::interval)::date;
    v_last_day := EXTRACT(DAY FROM (v_month_start + interval '1 month - 1 day'))::int;
    v_due := v_month_start + (LEAST(v_day, v_last_day) - 1);

    -- Primeiro inserimos sem a mensagem processada para gerar o short_id
    INSERT INTO public.charges (user_id, customer_id, installment, due_date, amount, message)
    VALUES (NEW.user_id, NEW.id, i + 1, v_due, NEW.amount, 'TEMP')
    RETURNING id, short_id INTO v_charge_id, v_short_id;

    -- Garantir que o ID tenha pelo menos 2 dígitos sem truncar (ex: 1 -> 01, 145 -> 145)
    v_padded_id := LPAD(v_short_id::text, GREATEST(length(v_short_id::text), 2), '0');

    -- Agora processamos a mensagem com o short_id (id) e o serviço
    v_msg := replace(
               replace(
                 replace(
                   replace(
                     replace(NEW.custom_message, '{cliente}', NEW.name),
                     '{valor}', 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00')),
                   '{vencimento}', to_char(v_due, 'DD/MM/YYYY')),
                 '{servico}', COALESCE(NEW.service_name, 'Serviço')),
               '{id}', v_padded_id);

    -- Atualizamos a cobrança com a mensagem final
    UPDATE public.charges SET message = v_msg WHERE id = v_charge_id;
  END LOOP;
  RETURN NEW;
END; $function$;

-- 2. Corrigir as mensagens já geradas que foram truncadas
-- Procuramos por "*ID:* XX" ou "ID: XX" onde XX são os primeiros 2 dígitos de um short_id >= 100
-- Ou simplesmente re-aplicamos a correção baseada no short_id atual para todas as faturas

-- Primeiro, vamos consertar o sufixo "*ID: " que foi adicionado pela migração anterior
UPDATE public.charges
SET message = regexp_replace(message, '\*ID:\* \d+', '*ID:* ' || LPAD(short_id::text, GREATEST(length(short_id::text), 2), '0'))
WHERE message ~ '\*ID:\* \d+';

-- Segundo, se o usuário usou "ID: {id}" no corpo da mensagem e ele foi truncado
-- Como não sabemos o texto original exato, vamos tentar identificar o padrão "ID: XX" 
-- que coincida com os primeiros 2 dígitos do short_id quando short_id >= 100
-- O usuário mencionou "Fatura ID: 14" para o ID 145, então o padrão é "ID: "
UPDATE public.charges
SET message = regexp_replace(message, 'ID: ' || LEFT(short_id::text, 2), 'ID: ' || short_id::text)
WHERE short_id >= 100 
  AND message ~ ('ID: ' || LEFT(short_id::text, 2))
  -- Garante que não estamos pegando um ID que já está correto (ex: 145 já está lá)
  AND message !~ ('ID: ' || short_id::text);

-- Grant permissões extras se necessário
GRANT ALL ON public.charges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
