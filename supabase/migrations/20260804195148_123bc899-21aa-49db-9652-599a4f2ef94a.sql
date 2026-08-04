DO $$
BEGIN
    UPDATE public.charges
    SET message = REPLACE(message, '{id}', LPAD(short_id::text, 2, '0'))
    WHERE message LIKE '%{id}%';
END $$;