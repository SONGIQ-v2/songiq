CREATE TABLE public.user_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_name_len CHECK (char_length(name) BETWEEN 1 AND 100),
  CONSTRAINT feedback_email_len CHECK (char_length(email) BETWEEN 3 AND 255),
  CONSTRAINT feedback_message_len CHECK (char_length(message) BETWEEN 1 AND 2000)
);
GRANT INSERT ON public.user_feedback TO anon, authenticated;
GRANT ALL ON public.user_feedback TO service_role;
ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit feedback" ON public.user_feedback FOR INSERT TO anon, authenticated WITH CHECK (true);