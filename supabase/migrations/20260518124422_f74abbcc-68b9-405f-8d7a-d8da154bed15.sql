CREATE TABLE public.game_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL,
  room_code VARCHAR NOT NULL,
  host_id UUID NOT NULL,
  host_name VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  total_rounds INT NOT NULL,
  rounds_played INT NOT NULL,
  time_per_round INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  rounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason VARCHAR NOT NULL
);

CREATE INDEX idx_game_history_archived_at ON public.game_history(archived_at);
CREATE INDEX idx_game_history_host_id ON public.game_history(host_id);
CREATE INDEX idx_game_history_room_code ON public.game_history(room_code);

ALTER TABLE public.game_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view their archived games"
ON public.game_history
FOR SELECT
TO authenticated
USING (auth.uid() = host_id);