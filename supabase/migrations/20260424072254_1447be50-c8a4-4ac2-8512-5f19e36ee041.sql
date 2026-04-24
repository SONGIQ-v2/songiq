ALTER TABLE public.game_rooms ALTER COLUMN max_players SET DEFAULT 25;
UPDATE public.game_rooms SET max_players = 25 WHERE max_players = 8 AND status = 'waiting';