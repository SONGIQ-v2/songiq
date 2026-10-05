// Signs/verifies the player id carried in reminder-email unsubscribe links,
// so a link can only ever unsubscribe the player it was sent to -- nobody can
// opt someone else out by editing the id in the URL. Keyed with the service
// role key (already a server-only secret); rotating that key invalidates
// links in previously sent emails, which is acceptable for daily reminders.

const encoder = new TextEncoder()

async function hmac(playerId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`unsubscribe:${playerId}`))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

export function unsubscribeToken(playerId: string): Promise<string> {
  return hmac(playerId)
}

export async function verifyUnsubscribeToken(playerId: string, token: string): Promise<boolean> {
  const expected = await hmac(playerId)
  if (token.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  return diff === 0
}
