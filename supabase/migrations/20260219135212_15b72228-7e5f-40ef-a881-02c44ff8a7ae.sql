
-- Add question_type column to game_rounds
ALTER TABLE public.game_rounds
ADD COLUMN question_type character varying NOT NULL DEFAULT 'artist';
