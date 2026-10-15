-- Scramble the answers in Daily / challenge plans sent to the browser.
--
-- The browser used to download each game's plan in plain JSON, so the
-- correct title / artist for every round could be read straight from the
-- DevTools Network tab before playing. Now each round's answer fields
-- (track_name, artist_name, track_id, artwork_url) are replaced by one
-- scrambled field "x" (XOR with a key, base64), which the game unscrambles
-- after download (src/lib/planScramble.ts). Audio, options and question
-- type stay readable -- the game needs them.
--
-- This deters casual peeking; it is not encryption -- the key ships in the
-- app. The salt (the Daily's date / the challenge code) makes every game's
-- scramble different.
--
-- The plain plan column is no longer readable by anon/authenticated, so the
-- RPCs below are the only way a browser gets a plan. A challenge's creator
-- still gets their own plan unscrambled (they played it).

-- Must match PLAN_SCRAMBLE_KEY in src/lib/planScramble.ts.
CREATE OR REPLACE FUNCTION public.plan_scramble_key()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'sq9-Lg7r#Afro2026-vT4m'::text $$;

REVOKE ALL ON FUNCTION public.plan_scramble_key() FROM PUBLIC, anon, authenticated;

-- XOR the UTF-8 bytes of p_text with the key (cycled), base64-encode.
CREATE OR REPLACE FUNCTION public.scramble_text(p_text text, p_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d bytea := convert_to(coalesce(p_text, ''), 'UTF8');
  k bytea := convert_to(p_key, 'UTF8');
  n int := length(d);
  kl int := length(k);
  i int;
BEGIN
  FOR i IN 0..n - 1 LOOP
    d := set_byte(d, i, get_byte(d, i) # get_byte(k, i % kl));
  END LOOP;
  RETURN translate(encode(d, 'base64'), E'\n', '');
END;
$$;

REVOKE ALL ON FUNCTION public.scramble_text(text, text) FROM PUBLIC, anon, authenticated;

-- Each round: answer fields removed, packed into "x" as {t, a, i, w}.
CREATE OR REPLACE FUNCTION public.scramble_plan(p_plan jsonb, p_salt text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      (e - 'track_name' - 'artist_name' - 'track_id' - 'artwork_url')
      || jsonb_build_object('x', scramble_text(
           jsonb_build_object(
             't', e ->> 'track_name',
             'a', e ->> 'artist_name',
             'i', e ->> 'track_id',
             'w', e ->> 'artwork_url'
           )::text,
           plan_scramble_key() || ':' || p_salt
         ))
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_plan) = 'array' THEN p_plan ELSE '[]'::jsonb END)
       WITH ORDINALITY AS t(e, ord);
$$;

REVOKE ALL ON FUNCTION public.scramble_plan(jsonb, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Daily
-- ============================================================

REVOKE SELECT ON public.daily_challenges FROM anon, authenticated;
GRANT SELECT (challenge_date, number, category_name, time_per_round, created_at, points_settled_at)
  ON public.daily_challenges TO anon, authenticated;

-- Today's (latest) Daily, plan scrambled with its date as the salt.
CREATE OR REPLACE FUNCTION public.get_daily_challenge()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'challenge_date', challenge_date,
    'number', number,
    'category_name', category_name,
    'time_per_round', time_per_round,
    'plan', scramble_plan(plan, challenge_date::text)
  )
  FROM daily_challenges
  WHERE challenge_date <= (now() AT TIME ZONE 'Africa/Lagos')::date
  ORDER BY challenge_date DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_daily_challenge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge() TO anon, authenticated;

-- ============================================================
-- Challenges
-- ============================================================

-- Scrambled for everyone except the challenge's creator; salt = the code.
CREATE OR REPLACE FUNCTION public.get_challenge_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge public.challenges;
BEGIN
  SELECT * INTO v_challenge FROM public.challenges WHERE code = upper(p_code);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_challenge.creator_id IS DISTINCT FROM auth.uid() THEN
    v_challenge.plan := scramble_plan(v_challenge.plan, v_challenge.code);
  END IF;
  RETURN to_jsonb(v_challenge);
END;
$$;

REVOKE ALL ON FUNCTION public.get_challenge_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_challenge_by_code(text) TO anon, authenticated;
