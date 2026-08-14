import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const name = String(body.name ?? '').slice(0, 100)
    const email = String(body.email ?? '').slice(0, 255)
    const message = String(body.message ?? '').slice(0, 2000)
    const submittedAt = String(body.submittedAt ?? new Date().toISOString())
    const feedbackId = String(body.feedbackId ?? crypto.randomUUID())

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract client IP from proxy headers
    const xff = req.headers.get('x-forwarded-for') ?? ''
    const ip =
      xff.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // Cloudflare header (may or may not be set); otherwise do a lookup
    let country = req.headers.get('cf-ipcountry') || ''
    let region = ''
    let city = ''

    if (ip && ip !== 'unknown') {
      try {
        const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
          headers: { 'User-Agent': 'songiq-feedback/1.0' },
        })
        if (geoRes.ok) {
          const geo = await geoRes.json()
          country = country || geo.country_name || geo.country || ''
          region = geo.region || ''
          city = geo.city || ''
        }
      } catch (_) {
        // non-blocking
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'feedback-notification',
        idempotencyKey: `feedback-${feedbackId}`,
        templateData: {
          name,
          email,
          message,
          submittedAt,
          ip,
          country,
          region,
          city,
        },
      },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
