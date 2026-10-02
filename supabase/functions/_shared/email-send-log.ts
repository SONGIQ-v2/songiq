import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts'
import { TEMPLATES } from './transactional-email-templates/registry.ts'

// Sends a registered template and records the outcome in email_send_log,
// keeping the delivery history the app has always kept. A log write never
// decides the send result.
export async function sendAndLog(
  templateName: string,
  to: string,
  options: { templateData?: Record<string, any>; idempotencyKey?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const recipient = TEMPLATES[templateName]?.to || to
  const log = async (status: string, error_message?: string) => {
    const { error } = await supabase.from('email_send_log').insert({
      message_id: null,
      template_name: templateName,
      recipient_email: recipient,
      status,
      error_message: error_message ?? null,
    })
    if (error) console.error('email_send_log insert failed', { code: error.code, message: error.message })
  }
  try {
    const result = await sendTemplateEmail(templateName, to, options)
    if (result.sent) {
      await log('sent')
      return { sent: true }
    }
    await log('suppressed')
    return { sent: false, reason: result.reason }
  } catch (e) {
    await log('failed', (e instanceof Error ? e.message : String(e)).slice(0, 1000))
    throw e
  }
}
