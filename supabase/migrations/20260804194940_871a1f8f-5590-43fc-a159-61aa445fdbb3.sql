-- Adicionar short_id sequencial na tabela charges
ALTER TABLE public.charges ADD COLUMN IF NOT EXISTS short_id SERIAL;

-- Garantir que a coluna tenha permissões corretas
GRANT SELECT, UPDATE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;

-- Atualizar a função para suportar {id} (short_id)
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

    -- Agora processamos a mensagem com o short_id (id) e o serviço
    v_msg := replace(
               replace(
                 replace(
                   replace(
                     replace(NEW.custom_message, '{cliente}', NEW.name),
                     '{valor}', 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00')),
                   '{vencimento}', to_char(v_due, 'DD/MM/YYYY')),
                 '{servico}', COALESCE(NEW.service_name, 'Serviço')),
               '{id}', LPAD(v_short_id::text, 2, '0'));

    -- Atualizamos a cobrança com a mensagem final
    UPDATE public.charges SET message = v_msg WHERE id = v_charge_id;
  END LOOP;
  RETURN NEW;
END; $function$;
