// Sends the admin a one-time email alert the first time an account signs in.
//
// Identity comes from the caller's own JWT -- never from the request body --
// so a player can't forge an alert for somebody else. The signup_notifications
// table is the once-and-only-once gate: the INSERT is the claim, and only the
// call that actually inserts a row goes on to queue the email.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

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

    // The Authorization header must be set explicitly: functions.invoke()
    // does not forward the client's own service-role key, and without it the
    // send function correctly rejects the call as unauthenticated.
    const { error: sendErr } = await admin.functions.invoke('send-transactional-email', {
      headers: { Authorization: `Bearer ${serviceKey}` },
      body: {
        templateName: 'new-signup-notification',
        idempotencyKey: `new-signup-${user.id}`,
        templateData: {
          name,
          email: user.email ?? '',
          provider,
          signedUpAt: user.created_at ?? new Date().toISOString(),
          totalAccounts: count ?? '',
        },
      },
    })

    if (sendErr) {
      let detail = ''
      try {
        const ctx = (sendErr as { context?: Response }).context
        if (ctx && typeof ctx.text === 'function') {
          detail = `${ctx.status} ${await ctx.text()}`
        }
      } catch { /* best effort */ }
      console.error('[notify-new-signup] email queue failed:', sendErr.message, detail)
      // 200, not 500: the player's sign-in succeeded and nothing on their side
      // can retry this. Surfacing a 5xx only breaks the client; the failure is
      // recorded in the logs for us instead.
      return json({ success: false, warning: 'email-queue-failed' })
    }

    console.log(`[notify-new-signup] alert queued for ${user.email ?? user.id}`)
    return json({ success: true })
  } catch (e) {
    console.error('[notify-new-signup] error:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
