
-- Atualizar a função para suportar {servico}
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
BEGIN
  v_day := EXTRACT(DAY FROM NEW.start_date)::int;

  FOR i IN 0..(NEW.months - 1) LOOP
    v_month_start := (date_trunc('month', NEW.start_date) + (i || ' month')::interval)::date;
    v_last_day := EXTRACT(DAY FROM (v_month_start + interval '1 month - 1 day'))::int;
    v_due := v_month_start + (LEAST(v_day, v_last_day) - 1);

    v_msg := replace(
               replace(
                 replace(
                   replace(NEW.custom_message, '{cliente}', NEW.name),
                   '{valor}', 'R$ ' || to_char(NEW.amount, 'FM999G999G990D00')),
                 '{vencimento}', to_char(v_due, 'DD/MM/YYYY')),
               '{servico}', COALESCE(NEW.service_name, 'Serviço'));

    INSERT INTO public.charges (user_id, customer_id, installment, due_date, amount, message)
    VALUES (NEW.user_id, NEW.id, i + 1, v_due, NEW.amount, v_msg);
  END LOOP;
  RETURN NEW;
END; $function$;
