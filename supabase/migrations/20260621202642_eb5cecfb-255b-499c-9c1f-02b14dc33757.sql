
CREATE TABLE public.hydra_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  operation TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown',
  query TEXT,
  request JSONB,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX hydra_traces_user_created_idx ON public.hydra_traces (user_id, created_at DESC);

GRANT SELECT ON public.hydra_traces TO authenticated;
GRANT ALL ON public.hydra_traces TO service_role;

ALTER TABLE public.hydra_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own traces read" ON public.hydra_traces
  FOR SELECT USING (auth.uid() = user_id);
