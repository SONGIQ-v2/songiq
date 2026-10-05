// Opts a player out of daily reminder emails. Two callers, both POST:
//  - Email clients' one-click "Unsubscribe" button (RFC 8058): POSTs to the
//    List-Unsubscribe URL, which carries u/t in the query string.
//  - The /unsubscribe page on songiq.io, which sends { u, t } as JSON.
// No sign-in required -- the signed token is the proof, and it only ever
// unsubscribes the player it was issued for.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { verifyUnsubscribeToken } from '../_shared/unsubscribe-token.ts'

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
  const { error } = await admin
    .from('email_unsubscribes')
    .upsert({ player_id: u }, { onConflict: 'player_id', ignoreDuplicates: true })
  if (error) {
    console.error('[email-unsubscribe] failed:', error.message)
    return json({ error: 'Could not unsubscribe right now' }, 500)
  }
  return json({ unsubscribed: true })
})
