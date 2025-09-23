import { supabase } from '@/integrations/supabase/client';

export interface BookingPayload {
  clientId: string;
  trainerId: string;
  sessionDate: string; // ISO format
  serviceTypeId: string;
  bookingMethod: 'pack' | 'subscription' | 'direct';
  sourcePackId?: string | null;
  sourceSubscriptionId?: string | null;
  source?: 'client-modal' | 'trainer-schedule' | 'other';
}

export async function bookSession(payload: BookingPayload): Promise<{ id: string }> {
  // Get the current session to pass the JWT token
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;

  if (!token) {
    throw new Error('Authentication required');
  }

  const { data, error } = await supabase.functions.invoke('manage-session', {
    body: {
      action: 'book',
      ...payload,
    },
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    console.error('BookSession error:', error);
    throw new Error(error.message || 'Failed to book session');
  }

  if (!data?.id) {
    throw new Error('No session ID returned from booking');
  }

  return { id: data.id };
}