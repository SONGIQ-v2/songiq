-- Two reminder slots per day (10:00 and 22:00 Lagos): track the last sent
-- slot key ("YYYY-MM-DD:am" / "YYYY-MM-DD:pm") instead of just a date.

ALTER TABLE public.push_subscriptions DROP COLUMN IF EXISTS last_notified;
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS last_notified_slot TEXT;

DROP INDEX IF EXISTS public.idx_push_subscriptions_last_notified;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_slot
  ON public.push_subscriptions(last_notified_slot);
