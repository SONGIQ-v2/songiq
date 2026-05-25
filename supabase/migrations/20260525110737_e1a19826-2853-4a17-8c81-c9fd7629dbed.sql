CREATE OR REPLACE FUNCTION public.server_time_ms()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

REVOKE ALL ON FUNCTION public.server_time_ms() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.server_time_ms() FROM anon;
GRANT EXECUTE ON FUNCTION public.server_time_ms() TO authenticated;