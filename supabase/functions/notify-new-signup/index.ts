// Sends the admin a one-time email alert the first time an account signs in.
//
// Identity comes from the caller's own JWT -- never from the request body --
// so a player can't forge an alert for somebody else. The signup_notifications
// table is the once-and-only-once gate: the INSERT is the claim, and only the
// call that actually inserts a row goes on to queue the email.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendAndLog } from '../_shared/email-send-log.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Cloudflare's header and ipapi's `country` are ISO-3166 alpha-2 codes, but
// the two used to be mixed with ipapi's full `country_name` -- normalize to
// the code so "NG" and "Nigeria" can't split into two buckets. XX = unknown,
// T1 = Tor exit node: neither is a real country.
function normalizeCountry(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null
}

type Geo = { country?: string; country_name?: string; region?: string; city?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Resolve the caller from their token.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    const user = userData?.user
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }
    // Anonymous play sessions are not accounts -- nothing to announce.
    if (user.is_anonymous) {
      return json({ skipped: 'anonymous' })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Extract client IP from proxy headers (same approach as feedback-notify)
    const xff = req.headers.get('x-forwarded-for') ?? ''
    const ip =
      xff.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // ipapi's free tier is capped per day, so it's looked up lazily and at
    // most once per request -- only when Cloudflare didn't supply a country
    // and none is stored yet, or when the first-signup email needs city/region.
    let geo: Geo | null | undefined
    const lookupGeo = async (): Promise<Geo | null> => {
      if (geo !== undefined) return geo
      geo = null
      if (ip && ip !== 'unknown') {
        try {
          const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: { 'User-Agent': 'songiq-signup/1.0' },
          })
          if (geoRes.ok) geo = await geoRes.json()
        } catch { /* non-blocking */ }
      }
      return geo
    }

    // This function runs on every signed-in page load (see gameStore.ts), so
    // keeping the account's country current here also fills it in for
    // accounts that signed up before it was captured. Stored as the ISO
    // code in app_metadata -- writable only with the service role, so a
    // player can't set their own, and visible to admin-analytics'
    // listUsers() scan without a separate table.
    const storedCountry = normalizeCountry(user.app_metadata?.country)
    const countryCode =
      normalizeCountry(req.headers.get('cf-ipcountry')) ??
      storedCountry ??
      normalizeCountry((await lookupGeo())?.country)
    if (countryCode && countryCode !== storedCountry) {
      const { error: geoErr } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, country: countryCode },
      })
      if (geoErr) console.error('[notify-new-signup] country save failed:', geoErr.message)
    }

    const provider =
      (user.app_metadata?.provider as string | undefined) ??
      (user.app_metadata?.providers as string[] | undefined)?.[0] ??
      'unknown'

    // Claim the alert. ON CONFLICT DO NOTHING means a second caller gets zero
    // rows back and quietly stops here.
    // A plain INSERT, not an upsert: the primary key is the lock. Exactly one
    // concurrent caller can succeed; everyone else gets 23505 and stops.
    const { error: claimErr } = await admin
      .from('signup_notifications')
      .insert({ user_id: user.id, email: user.email ?? null, provider })

    if (claimErr) {
      if (claimErr.code === '23505') {
        return json({ skipped: 'already-notified' })
      }
      console.error('[notify-new-signup] claim failed:', claimErr.message)
      return json({ error: 'Failed to record signup' }, 500)
    }

    const { count } = await admin
      .from('signup_notifications')
      .select('user_id', { count: 'exact', head: true })

    const name =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      'Player'

    const emailGeo = await lookupGeo()
    const country = emailGeo?.country_name || countryCode || ''
    const region = emailGeo?.region || ''
    const city = emailGeo?.city || ''

    try {
      await sendAndLog('new-signup-notification', '', {
        idempotencyKey: `new-signup-${user.id}`,
        templateData: {
          name,
          email: user.email ?? '',
          provider,
          signedUpAt: user.created_at ?? new Date().toISOString(),
          totalAccounts: count ?? '',
          ip,
          country,
          region,
          city,
        },
      })
    } catch (sendErr) {
      console.error('[notify-new-signup] email send failed:', (sendErr as Error).message)
      // 200, not 500: the player's sign-in succeeded and nothing on their side
      // can retry this.
      return json({ success: false, warning: 'email-send-failed' })
    }

    console.log(`[notify-new-signup] alert sent for ${user.id}`)
    return json({ success: true })
  } catch (e) {
    console.error('[notify-new-signup] error:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
