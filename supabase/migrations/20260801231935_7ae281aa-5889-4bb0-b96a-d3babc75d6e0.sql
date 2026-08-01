CREATE TABLE public.charge_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  charge_id uuid NOT NULL REFERENCES public.charges(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('sent','failed','status_changed')),
  detail text,
  phone text,
  message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_charge_events_charge_id ON public.charge_events(charge_id);
CREATE INDEX idx_charge_events_user_id ON public.charge_events(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.charge_events TO authenticated;
GRANT ALL ON public.charge_events TO service_role;

ALTER TABLE public.charge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own charge events" ON public.charge_events
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);