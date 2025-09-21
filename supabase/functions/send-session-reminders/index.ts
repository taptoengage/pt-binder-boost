import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { safeInvokeEmail, isEmailSendingEnabled } from '../_shared/email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Allow manual trigger + schedule trigger
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    // Kill-switch short-circuit
    if (!isEmailSendingEnabled()) {
      console.log('[reminders] EMAIL_TX_ENABLED=false, skipping run')
      return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }})
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN') ?? ''
    if (!internalToken) {
      console.warn('[reminders] Missing INTERNAL_FUNCTION_TOKEN')
    }

    const now = new Date()
    // Pull sessions in a wide window so we can check both 24h and 2h inside the function.
    const upperBound = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString()

    // Fetch candidate sessions & joined emails / preferences
    const { data: sessions, error } = await supabaseAdmin
      .from('sessions')
      .select(`
        id, session_date, status, service_type_id,
        client:clients(id, email, email_notifications_enabled),
        trainer:trainers(id, contact_email, email_notifications_enabled)
      `)
      .eq('status', 'scheduled')
      .gte('session_date', now.toISOString())
      .lte('session_date', upperBound)

    if (error) throw error

    const sendIfNeeded = async (session: any) => {
      const start = new Date(session.session_date)
      const diffMins = Math.round((start.getTime() - now.getTime()) / 60000)

      const inWindow = (target: number) => Math.abs(diffMins - target) <= 5
      const is24h = inWindow(1440)
      const is2h  = inWindow(120)

      if (!is24h && !is2h) return

      // Idempotency guard (try insert; if conflict, skip)
      const type = is24h ? 'reminder_24h' : 'reminder_2h'
      const { error: insertErr } = await supabaseAdmin
        .from('session_notifications')
        .insert({ session_id: session.id, notification_type: type })
        .select('id')
        .single()

      if (insertErr) {
        // If unique violation, we already sent it; skip quietly.
        if ((insertErr as any).code === '23505') {
          console.log('[reminders] duplicate skip', { session: session.id, type })
          return
        }
        console.warn('[reminders] idempotency insert error', { session: session.id, type, err: insertErr?.message })
        return
      }

      // Human-readable time (AEST)
      const humanDate = start.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
      const subject = is24h ? 'Reminder: session in 24 hours' : 'Reminder: session in 2 hours'
      const bodyClient  = `Hi! This is a friendly reminder that your session is scheduled for ${humanDate}.`
      const bodyTrainer = `Heads up: you have a session scheduled for ${humanDate}.`

      // Client
      if (session.client?.email && session.client?.email_notifications_enabled) {
        await safeInvokeEmail(supabaseAdmin, {
          type: 'GENERIC',
          to: session.client.email,
          data: { subject, body: bodyClient },
          internalToken
        })
      }

      // Trainer
      if (session.trainer?.contact_email && session.trainer?.email_notifications_enabled) {
        await safeInvokeEmail(supabaseAdmin, {
          type: 'GENERIC',
          to: session.trainer.contact_email,
          data: { subject, body: bodyTrainer },
          internalToken
        })
      }

      console.log('[reminders] sent', { session: session.id, type })
    }

    await Promise.all((sessions ?? []).map(sendIfNeeded))

    return new Response(JSON.stringify({ ok: true, scanned: sessions?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('[reminders] error', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})