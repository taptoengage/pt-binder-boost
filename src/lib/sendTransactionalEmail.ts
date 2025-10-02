import { supabase } from '@/integrations/supabase/client';

interface EmailPayload {
  type: 'WELCOME' | 'GENERIC' | 'SESSION_BOOKED';
  to: string;
  data?: Record<string, any>;
}

export async function sendTransactionalEmail(payload: EmailPayload) {
  const internalToken = import.meta.env.VITE_INTERNAL_FUNCTION_TOKEN;
  
  if (!internalToken) {
    throw new Error('VITE_INTERNAL_FUNCTION_TOKEN environment variable is not set');
  }

  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: payload,
    headers: { 'x-ot-internal-token': internalToken },
  });

  if (error) {
    throw error;
  }

  return data;
}