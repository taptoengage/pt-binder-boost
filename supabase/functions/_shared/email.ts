/**
 * Shared email utilities for edge functions with kill-switch capability
 */

/**
 * Check if email sending is enabled via environment variable
 * @returns true only when EMAIL_TX_ENABLED is exactly 'true'
 */
export function isEmailSendingEnabled(): boolean {
  return Deno.env.get('EMAIL_TX_ENABLED') === 'true';
}

/**
 * Safely invoke the send-transactional-email function with kill-switch protection
 * @param supabaseAdmin - Supabase client with service role
 * @param params - Email parameters
 */
export async function safeInvokeEmail(
  supabaseAdmin: any,
  { to, type, data, internalToken }: {
    to: string;
    type: string;
    data?: Record<string, any>;
    internalToken: string;
  }
): Promise<void> {
  // Check kill-switch first
  if (!isEmailSendingEnabled()) {
    console.log('[email] skipped (EMAIL_TX_ENABLED=false)', { type, to });
    return;
  }

  try {
    await supabaseAdmin.functions.invoke('send-transactional-email', {
      body: { type, to, data },
      headers: { 'x-ot-internal-token': internalToken }
    });
    
    console.log('[email] sent', { type, to });
  } catch (error) {
    console.warn('[email] failed', { type, to, error: error?.message });
  }
}