import { supabase } from "@/integrations/supabase/client";

/**
 * Universal pack over-scheduling validation function
 * Counts all sessions that consume pack credits and validates against total sessions
 */
export async function validatePackAvailability(packId: string, totalSessions: number): Promise<{
  isValid: boolean;
  errorMessage?: string;
  sessionsUsedOrScheduled: number;
  sessionsAvailable: number;
}> {
  try {
    // Get all sessions for this pack to calculate used/scheduled count
    const { data: packSessions, error: packError } = await supabase
      .from('sessions')
      .select('status, cancellation_reason')
      .eq('session_pack_id', packId);

    if (packError) {
      throw new Error(`Database error: ${packError.message}`);
    }

    // Count sessions that consume pack credits (scheduled + consumed + penalty cancelled)
    const sessionsUsedOrScheduled = packSessions?.filter(session => 
      session.status === 'scheduled' ||
      session.status === 'completed' || 
      session.status === 'no-show' ||
      (session.status === 'cancelled' && session.cancellation_reason === 'penalty')
    ).length || 0;

    const sessionsAvailable = totalSessions - sessionsUsedOrScheduled;

    if (sessionsUsedOrScheduled >= totalSessions) {
      return {
        isValid: false,
        errorMessage: "This pack has no available sessions remaining. All sessions are either scheduled or consumed.",
        sessionsUsedOrScheduled,
        sessionsAvailable
      };
    }

    return {
      isValid: true,
      sessionsUsedOrScheduled,
      sessionsAvailable
    };
  } catch (error) {
    console.error('Error validating pack availability:', error);
    return {
      isValid: false,
      errorMessage: "Unable to verify pack availability. Please try again.",
      sessionsUsedOrScheduled: 0,
      sessionsAvailable: 0
    };
  }
}