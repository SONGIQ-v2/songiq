CREATE TABLE public.client_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  player_id uuid,
  room_id uuid,
  room_code varchar,
  level varchar NOT NULL DEFAULT 'info',
  event varchar,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  stack text,
  url text,
  user_agent text
);

CREATE INDEX idx_client_logs_created_at ON public.client_logs(created_at);
CREATE INDEX idx_client_logs_player_id ON public.client_logs(player_id);
CREATE INDEX idx_client_logs_room_code ON public.client_logs(room_code);
CREATE INDEX idx_client_logs_level ON public.client_logs(level);

ALTER TABLE public.client_logs ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authed) can insert their own log
CREATE POLICY "Anyone can insert client logs"
  ON public.client_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Users can view their own logs
CREATE POLICY "Users can view their own client logs"
  ON public.client_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);
