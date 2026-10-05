-- Daily reminder emails (sent via Resend by the send-daily-reminders edge
-- function). Both tables are service-role-only: RLS is on with no policies,
-- so no client -- anonymous or signed in -- can read or write them.

-- Players who opted out of reminder emails, via the link/one-click header
-- in every email (handled by the email-unsubscribe edge function).
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
  player_id UUID NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- One row per player per Daily Challenge date they were emailed about. The
-- primary key makes a send idempotent: if the scheduled job fires twice (or
-- is re-run by hand), nobody gets a second email for the same day.
CREATE TABLE IF NOT EXISTS public.daily_reminder_sends (
  player_id UUID NOT NULL,
  challenge_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, challenge_date)
);
ALTER TABLE public.daily_reminder_sends ENABLE ROW LEVEL SECURITY;
