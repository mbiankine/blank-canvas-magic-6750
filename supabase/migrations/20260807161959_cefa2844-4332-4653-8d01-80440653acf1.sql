-- 1. Atualizar a função de geração de cobranças para garantir que o ID não seja truncado
-- O uso de LPAD(short_id::text, 2, '0') em IDs > 99 (ex: 145) resulta em '45' se o comprimento for fixado em 2.
-- A nova versão usa GREATEST para garantir pelo menos 2 dígitos, mas sem teto.
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

    -- 1. Inserir para gerar o short_id
    INSERT INTO public.charges (user_id, customer_id, installment, due_date, amount, message)
    VALUES (NEW.user_id, NEW.id, i + 1, v_due, NEW.amount, 'TEMP')
    RETURNING id, short_id INTO v_charge_id, v_short_id;

    -- 2. Formatar ID: 1 -> '01', 145 -> '145'
    v_padded_id := LPAD(v_short_id::text, GREATEST(length(v_short_id::text), 2), '0');

    -- 3. Montar mensagem final
    v_msg := replace(
               replace(
                 replace(
                   replace(
                     replace(NEW.custom_message, '{cliente}', NEW.name),
                     '{valor}', 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00')),
                   '{vencimento}', to_char(v_due, 'DD/MM/YYYY')),
                 '{servico}', COALESCE(NEW.service_name, 'Serviço')),
               '{id}', v_padded_id);

    -- 4. Atualizar com a mensagem real
    UPDATE public.charges SET message = v_msg WHERE id = v_charge_id;
  END LOOP;
  RETURN NEW;
END; $function$;

-- 2. Corrigir faturas existentes que exibem o ID truncado
-- Exemplo: Se short_id = 145 e a mensagem diz "Fatura ID: 45", corrigimos para "Fatura ID: 145"
UPDATE public.charges
SET message = regexp_replace(message, 'ID: ' || (short_id % 100)::text, 'ID: ' || short_id::text)
WHERE short_id >= 100 
  AND message ~ ('ID: ' || LPAD((short_id % 100)::text, 2, '0'))
  AND message !~ ('ID: ' || short_id::text);

-- Corrigir também o padrão com asteriscos se houver
UPDATE public.charges
SET message = regexp_replace(message, '\*ID:\* ' || (short_id % 100)::text, '*ID:* ' || short_id::text)
WHERE short_id >= 100 
  AND message ~ ('\*ID:\* ' || LPAD((short_id % 100)::text, 2, '0'))
  AND message !~ ('\*ID:\* ' || short_id::text);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
