CREATE OR REPLACE FUNCTION public.server_time_ms()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

GRANT EXECUTE ON FUNCTION public.server_time_ms() TO authenticated;