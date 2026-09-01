-- 1. Security definer view -> invoker (view already self-filters by membership,
--    and game_rounds RLS allows room participants to select).
ALTER VIEW public.game_rounds_public SET (security_invoker = true);

-- 2. Pin search_path on the pgmq helper functions (all refs are schema-qualified).
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = '';
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = '';
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = '';
ALTER FUNCTION public.server_time_ms() SET search_path = 'public';

-- 3. Trigger functions must never be directly callable by API roles.
REVOKE EXECUTE ON FUNCTION public.archive_room_created() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_room_player_joined() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_canonical_nickname() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_challenge_created() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_room_created() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated, PUBLIC;

-- 4. Email-queue internals are service-role / cron only.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role, postgres;

-- 5. Internal helper: only reachable server-side.
REVOKE EXECUTE ON FUNCTION public.verified_player_ids(uuid[]) FROM anon;