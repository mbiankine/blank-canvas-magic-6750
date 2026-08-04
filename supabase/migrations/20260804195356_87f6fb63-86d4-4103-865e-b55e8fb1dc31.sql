DO $$ 
BEGIN 
    UPDATE public.charges 
    SET message = message || E'\n\n*ID:* ' || LPAD(short_id::text, 2, '0')
    WHERE message NOT LIKE '%*ID:*%';
END $$;