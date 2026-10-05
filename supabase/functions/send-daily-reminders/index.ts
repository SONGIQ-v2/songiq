// Emails signed-in players who haven't played today's Daily Challenge yet,
// via Resend. Run once a day in the evening (Lagos) by a pg_cron job -- see
// the scheduling SQL handed over alongside this function.
//
// Who gets one: every non-anonymous account with an email, minus anyone who
// already played today, unsubscribed (email_unsubscribes), is suppressed
// for bounces/complaints (suppressed_emails), or was already emailed about
// today's Daily (daily_reminder_sends -- the job is safe to re-run).
//
// Required secrets: RESEND_API_KEY. Optional: RESEND_FROM_EMAIL (defaults to
// reminders@mail.songiq.io -- must be on a domain verified in Resend; NOT
// notify.songiq.io, which is delegated to Lovable's email service).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { unsubscribeToken } from '../_shared/unsubscribe-token.ts'

const SITE_URL = 'https://songiq.io'
const RESEND_BATCH_MAX = 100 // Resend's per-request limit for /emails/batch
const QUERY_CHUNK = 300 // keeps .in() filters well under URL-length limits

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** YYYY-MM-DD in Lagos time (UTC+1), the Daily Challenge's day boundary. */
const lagosDate = (offsetDays = 0) =>
  new Date(Date.now() + 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface Recipient {
  id: string
  email: string
  streakAtRisk: number // 0 when there's no streak to lose
  nickname: string | null // greeting name: in-app nickname, else Google first name; null = "there"
}

type TopScore = { player_name: string; score: number }

const FONT = 'Arial,Helvetica,sans-serif'
const CARD = 'background:#1f2937;border-radius:14px;'

// Table-based with inline styles throughout: Outlook and several webmail
// clients ignore flexbox/grid and <style> blocks.
function buildEmail(
  r: Recipient,
  daily: { number: number; category_name: string },
  top3: TopScore[],
  unsubUrl: string,
  oneClickUrl: string,
  from: string
) {
  const playUrl = `${SITE_URL}/daily?utm_source=email&utm_medium=daily_reminder&utm_campaign=daily_${daily.number}`
  const category = escapeHtml(daily.category_name)
  const greetingName = escapeHtml(r.nickname?.trim() || 'there')

  const subject = r.streakAtRisk
    ? `🔥 Your ${r.streakAtRisk}-day streak ends at midnight`
    : `🎵 Daily #${daily.number} is waiting: ${daily.category_name}`
  const headline = r.streakAtRisk ? `🔥 ${r.streakAtRisk}-Day Streak at Risk!` : `🎵 Today's Daily is still open`
  const subline = r.streakAtRisk
    ? `Play today before midnight to protect your flame and keep your streak alive.`
    : `Same 10 songs for everyone, one attempt. It closes at midnight.`

  const rankColor = ['#fbbf24', '#d1d5db', '#9ca3af']
  const boardRows = top3.length
    ? top3
        .map(
          (s, i) => `
          <tr><td style="padding:0 0 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:10px;">
              <tr>
                <td style="padding:12px 14px;font-family:${FONT};font-size:14px;font-weight:bold;color:${rankColor[i]};width:36px;">#${i + 1}</td>
                <td style="padding:12px 0;font-family:${FONT};font-size:14px;font-weight:bold;color:#f9fafb;">${escapeHtml(s.player_name)}</td>
                <td align="right" style="padding:12px 14px;font-family:${FONT};font-size:14px;font-weight:bold;color:#f9fafb;white-space:nowrap;">${s.score.toLocaleString('en-US')} <span style="color:#9ca3af;font-weight:normal;">pts</span></td>
              </tr>
            </table>
          </td></tr>`
        )
        .join('')
    : `<tr><td style="padding:4px 0 8px;font-family:${FONT};font-size:14px;color:#9ca3af;">No scores yet — be the first on today's board.</td></tr>`

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

      <!-- Logo -->
      <tr><td style="padding:0 0 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding:0 12px 0 0;"><img src="${SITE_URL}/icons/icon-192.png" width="44" height="44" alt="SongIQ" style="display:block;border-radius:10px;"></td>
          <td>
            <div style="font-family:${FONT};font-size:20px;font-weight:bold;color:#f9fafb;letter-spacing:0.5px;">SONGIQ</div>
            <div style="font-family:${FONT};font-size:10px;font-weight:bold;color:#9ca3af;letter-spacing:2px;">TEST YOUR MUSIC IQ</div>
          </td>
        </tr></table>
      </td></tr>

      <!-- Greeting -->
      <tr><td style="font-family:${FONT};font-size:16px;font-weight:bold;color:#d1d5db;padding:0 0 8px;">Hi ${greetingName},</td></tr>

      <!-- Headline -->
      <tr><td style="font-family:${FONT};font-size:28px;line-height:1.25;font-weight:bold;color:#f9fafb;padding:0 0 10px;">${headline}</td></tr>
      <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:#d1d5db;padding:0 0 24px;">${subline}</td></tr>

      <!-- Today's challenge -->
      <tr><td style="padding:0 0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${CARD}">
          <tr><td style="padding:18px 20px;">
            <div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#22d3ee;padding:0 0 6px;">DAILY CHALLENGE #${daily.number}</div>
            <div style="font-family:${FONT};font-size:22px;font-weight:bold;color:#f9fafb;">${category}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- Leaderboard -->
      <tr><td style="padding:0 0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${CARD}">
          <tr><td style="padding:18px 20px 10px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>
              <td style="font-family:${FONT};font-size:14px;font-weight:bold;color:#f9fafb;">🏆 Daily Leaderboard</td>
              <td align="right" style="font-family:${FONT};font-size:12px;color:#22d3ee;">Top Scores</td>
            </tr></table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${boardRows}</table>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td align="center" style="padding:0 0 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="center" style="background:#fbbf24;border-radius:12px;">
            <a href="${playUrl}" style="display:block;padding:18px 24px;font-family:${FONT};font-size:18px;font-weight:bold;letter-spacing:0.5px;color:#111827;text-decoration:none;">PLAY TODAY'S CHALLENGE &rarr;</a>
          </td>
        </tr></table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280;">
        You're getting this because you have a SongIQ account.
        <a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe from daily reminders</a>.
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`

  const board = top3.length
    ? top3.map((s, i) => `#${i + 1} ${s.player_name} — ${s.score} pts`).join('\n')
    : `No scores yet — be the first on today's board.`
  const text = `Hi ${r.nickname?.trim() || 'there'},\n\n${headline}\n${subline}\n\nDaily Challenge #${daily.number}: ${daily.category_name}\n\nDaily Leaderboard\n${board}\n\nPlay today's challenge: ${playUrl}\n\nUnsubscribe from daily reminders: ${unsubUrl}`

  return {
    from,
    to: [r.email],
    subject,
    html,
    text,
    headers: {
      // RFC 8058 one-click unsubscribe -- Gmail/Yahoo require this from bulk
      // senders, and it gives users an "Unsubscribe" button in their inbox.
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

Deno.serve(async (req) => {
  // Test mode: { "testEmail": "you@example.com" } sends just that one
  // account's email -- ignoring the played/already-sent filters and
  // recording nothing -- so the template and sender can be checked before
  // the first real send goes to everyone. Add "via": "lovable" to send it
  // through the existing Lovable transactional setup (notify.songiq.io)
  // instead, for previewing before Resend is set up. Test sends only: daily
  // reminders to everyone aren't transactional mail.
  const body = await req.json().catch(() => ({}))
  const testEmail = typeof body?.testEmail === 'string' ? body.testEmail.trim().toLowerCase() : null
  const viaLovable = !!testEmail && body?.via === 'lovable'

  // The real send-to-everyone run is the scheduled job only, called with the
  // service role key. A signed-in (non-anonymous) user may additionally
  // trigger test mode, but only to their own address -- the most anyone can
  // do with it is email themselves one preview.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${serviceKey}`) {
    if (!testEmail) return json({ error: 'Unauthorized' }, 401)
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data, error } = await anon.auth.getUser(authHeader.replace('Bearer ', ''))
    if (error || !data.user || data.user.is_anonymous) return json({ error: 'Unauthorized' }, 401)
    if (data.user.email?.toLowerCase() !== testEmail) {
      return json({ error: 'Test emails can only be sent to your own address' }, 403)
    }
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey && !viaLovable) return json({ error: 'RESEND_API_KEY is not configured' }, 500)
  const from = Deno.env.get('RESEND_FROM_EMAIL') || 'SongIQ <reminders@mail.songiq.io>'

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, serviceKey)
  const today = lagosDate(0)
  const yesterday = lagosDate(-1)

  try {
    const { data: daily } = await admin
      .from('daily_challenges')
      .select('challenge_date, number, category_name')
      .eq('challenge_date', today)
      .maybeSingle()
    if (!daily) return json({ skipped: 'no-daily-today', date: today })

    // Same top 3 for every recipient, so fetched once per run.
    const { data: topRows } = await admin
      .from('daily_attempts')
      .select('player_name, score')
      .eq('challenge_date', today)
      .order('score', { ascending: false })
      .limit(3)
    const top3: TopScore[] = topRows ?? []

    // Every real (non-anonymous) account with an email, plus their first
    // name from Google -- the greeting's fallback when there's no nickname.
    const accounts: { id: string; email: string; firstName: string | null }[] = []
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw new Error(`listUsers failed: ${error.message}`)
      for (const u of data.users) {
        if (u.is_anonymous || !u.email) continue
        const meta = u.user_metadata ?? {}
        const fullName = String(meta.given_name || meta.full_name || meta.name || '').trim()
        accounts.push({ id: u.id, email: u.email, firstName: fullName.split(/\s+/)[0] || null })
      }
      if (data.users.length < 200) break
    }

    const played = new Set<string>()
    const unsubscribed = new Set<string>()
    const alreadySent = new Set<string>()
    const streakById = new Map<string, number>()
    const nicknameById = new Map<string, string>()
    for (const ids of chunk(accounts.map((a) => a.id), QUERY_CHUNK)) {
      const [attempts, unsubs, sends, stats, names] = await Promise.all([
        admin.from('daily_attempts').select('player_id').eq('challenge_date', today).in('player_id', ids),
        admin.from('email_unsubscribes').select('player_id').in('player_id', ids),
        admin.from('daily_reminder_sends').select('player_id').eq('challenge_date', today).in('player_id', ids),
        admin.from('daily_stats').select('player_id, current_streak, last_played').in('player_id', ids),
        admin.from('player_points').select('player_id, player_name').in('player_id', ids),
      ])
      // The player's nickname -- player_points.player_name is the canonical
      // one for signed-in accounts (only set_nickname() changes it).
      // 'A music fan' is the placeholder default, not a nickname, so it falls
      // through to their first name (then "there").
      for (const r of names.data ?? []) {
        const name = r.player_name?.trim()
        if (name && name.toLowerCase() !== 'a music fan') nicknameById.set(r.player_id, name)
      }
      for (const r of attempts.data ?? []) played.add(r.player_id)
      for (const r of unsubs.data ?? []) unsubscribed.add(r.player_id)
      for (const r of sends.data ?? []) alreadySent.add(r.player_id)
      for (const r of stats.data ?? []) {
        // Still alive only if they played yesterday; >= 2 so "1-day streak" isn't a thing.
        if (r.last_played === yesterday && r.current_streak >= 2) streakById.set(r.player_id, r.current_streak)
      }
    }

    // Addresses that bounced or marked mail as spam (recorded by
    // handle-email-events). Sending to them again hurts deliverability.
    const suppressed = new Set<string>()
    for (const emails of chunk(accounts.map((a) => a.email.toLowerCase()), QUERY_CHUNK)) {
      const { data, error } = await admin.from('suppressed_emails').select('email').in('email', emails)
      if (error) {
        console.error('[send-daily-reminders] suppressed_emails lookup failed:', error.message)
        break
      }
      for (const r of data ?? []) suppressed.add(r.email)
    }

    const toRecipient = (a: (typeof accounts)[number]): Recipient => ({
      id: a.id,
      email: a.email,
      streakAtRisk: streakById.get(a.id) ?? 0,
      nickname: nicknameById.get(a.id) ?? a.firstName,
    })

    if (testEmail) {
      const account = accounts.find((a) => a.email.toLowerCase() === testEmail)
      if (!account) return json({ error: `No signed-in account with email ${testEmail}` }, 404)
      const r = toRecipient(account)
      const qs = `u=${r.id}&t=${await unsubscribeToken(r.id)}`
      const message = buildEmail(r, daily, top3, `${SITE_URL}/unsubscribe?${qs}`, `${supabaseUrl}/functions/v1/email-unsubscribe?${qs}`, from)

      if (viaLovable) {
        const apiKey = Deno.env.get('LOVABLE_API_KEY')
        if (!apiKey) return json({ error: 'LOVABLE_API_KEY is not configured' }, 500)
        try {
          await sendLovableEmail(
            {
              to: r.email,
              // Same sender identity as send-email.ts -- notify.songiq.io is
              // the subdomain delegated to Lovable.
              from: 'SongIQ Africa <noreply@notify.songiq.io>',
              sender_domain: 'notify.songiq.io',
              subject: `[TEST] ${message.subject}`,
              html: message.html,
              text: message.text,
              purpose: 'transactional',
              label: 'daily-reminder-test',
              idempotency_key: crypto.randomUUID(),
            },
            { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }
          )
        } catch (e) {
          return json({ test: true, via: 'lovable', error: (e as Error).message }, 502)
        }
        return json({ test: true, via: 'lovable', to: r.email, nickname: r.nickname, streakAtRisk: r.streakAtRisk })
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      })
      const resendBody = await res.text()
      return json({ test: true, to: r.email, streakAtRisk: r.streakAtRisk, resendStatus: res.status, resend: resendBody }, res.ok ? 200 : 502)
    }

    const recipients: Recipient[] = accounts
      .filter((a) => !played.has(a.id) && !unsubscribed.has(a.id) && !alreadySent.has(a.id) && !suppressed.has(a.email.toLowerCase()))
      .map(toRecipient)

    let sent = 0
    let failed = 0
    for (const batch of chunk(recipients, RESEND_BATCH_MAX)) {
      // Claim first: the primary key on (player_id, challenge_date) means a
      // concurrent or repeated run can't claim -- and so can't email -- the
      // same player twice for today's Daily.
      const { data: claimed, error: claimErr } = await admin
        .from('daily_reminder_sends')
        .upsert(batch.map((r) => ({ player_id: r.id, challenge_date: today })), {
          onConflict: 'player_id,challenge_date',
          ignoreDuplicates: true,
        })
        .select('player_id')
      if (claimErr) {
        console.error('[send-daily-reminders] claim failed:', claimErr.message)
        failed += batch.length
        continue
      }
      const claimedIds = new Set((claimed ?? []).map((r) => r.player_id))
      const toSend = batch.filter((r) => claimedIds.has(r.id))
      if (toSend.length === 0) continue

      const messages = await Promise.all(
        toSend.map(async (r) => {
          const qs = `u=${r.id}&t=${await unsubscribeToken(r.id)}`
          return buildEmail(r, daily, top3, `${SITE_URL}/unsubscribe?${qs}`, `${supabaseUrl}/functions/v1/email-unsubscribe?${qs}`, from)
        })
      )
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      })
      if (res.ok) {
        sent += toSend.length
      } else {
        // Release the claims so a later run can retry these players.
        console.error('[send-daily-reminders] Resend batch failed:', res.status, await res.text())
        failed += toSend.length
        await admin
          .from('daily_reminder_sends')
          .delete()
          .eq('challenge_date', today)
          .in('player_id', toSend.map((r) => r.id))
      }
    }

    const summary = {
      date: today,
      accounts: accounts.length,
      alreadyPlayed: played.size,
      unsubscribed: unsubscribed.size,
      suppressed: suppressed.size,
      sent,
      failed,
    }
    console.log('[send-daily-reminders]', JSON.stringify(summary))
    return json(summary)
  } catch (e) {
    console.error('[send-daily-reminders] error:', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
