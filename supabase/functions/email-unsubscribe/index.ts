// Opts a player out of daily reminder emails. Two callers, both POST:
//  - Email clients' one-click "Unsubscribe" button (RFC 8058): POSTs to the
//    List-Unsubscribe URL, which carries u/t in the query string.
//  - The /unsubscribe page on songiq.io, which sends { u, t } as JSON.
// No sign-in required -- the signed token is the proof, and it only ever
// unsubscribes the player it was issued for.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { verifyUnsubscribeToken } from '../_shared/unsubscribe-token.ts'
import { sendAndLog } from '../_shared/email-send-log.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // POST only: a GET here would let link-scanning security software (which
  // prefetches every URL in an email) unsubscribe people without them acting.
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  let u = url.searchParams.get('u')
  let t = url.searchParams.get('t')
  if ((!u || !t) && req.headers.get('content-type')?.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    u = typeof body.u === 'string' ? body.u : null
    t = typeof body.t === 'string' ? body.t : null
  }

  if (!u || !t || !UUID.test(u) || !(await verifyUnsubscribeToken(u, t))) {
    return json({ error: 'Invalid or expired unsubscribe link' }, 400)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // ignoreDuplicates + select returns the row only when it was newly
  // inserted, so a repeat click doesn't send the admin a second alert.
  const { data: inserted, error } = await admin
    .from('email_unsubscribes')
    .upsert({ player_id: u }, { onConflict: 'player_id', ignoreDuplicates: true })
    .select('player_id')
  if (error) {
    console.error('[email-unsubscribe] failed:', error.message)
    return json({ error: 'Could not unsubscribe right now' }, 500)
  }
  if (inserted?.length) await notifyAdmin(admin, u)
  return json({ unsubscribed: true })
})

// Emails the admin (same Lovable template setup as the new-signup alert).
// Never affects the unsubscribe itself -- that's already saved.
async function notifyAdmin(admin: SupabaseClient<any>, playerId: string) {
  try {
    const [{ data: userData }, { data: points }, { count }] = await Promise.all([
      admin.auth.admin.getUserById(playerId),
      admin.from('player_points').select('player_name').eq('player_id', playerId).maybeSingle(),
      admin.from('email_unsubscribes').select('player_id', { count: 'exact', head: true }),
    ])
    const user = userData?.user
    const meta = user?.user_metadata ?? {}
    await sendAndLog('unsubscribe-notification', '', {
      idempotencyKey: `unsubscribe-${playerId}`,
      templateData: {
        name: String(meta.full_name || meta.name || ''),
        nickname: points?.player_name ?? '',
        email: user?.email ?? '',
        unsubscribedAt: new Date().toISOString(),
        totalUnsubscribed: count ?? '',
      },
    })
  } catch (e) {
    console.error('[email-unsubscribe] admin alert failed:', (e as Error).message)
  }
}
