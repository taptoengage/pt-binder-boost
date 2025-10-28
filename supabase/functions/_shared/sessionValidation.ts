// Shared session validation logic for one-off and recurring bookings
import { addHours, parseISO, differenceInHours } from "https://esm.sh/date-fns@3.6.0";

export interface ValidationResult {
  isValid: boolean;
  status: "ok" | "conflict" | "warning";
  message?: string;
}

/**
 * Validates a single session for availability and conflicts
 * Reuses the same logic as one-off bookings in manage-session
 */
export async function validateSessionAvailability(
  supabaseClient: any,
  params: {
    trainerId: string;
    sessionUtc: string;
    serviceTypeId: string;
    excludeSessionId?: string;
  }
): Promise<ValidationResult> {
  const { trainerId, sessionUtc, serviceTypeId, excludeSessionId } = params;

  let bookingDateTime: Date;
  try {
    bookingDateTime = parseISO(sessionUtc);
    if (isNaN(bookingDateTime.getTime())) {
      return { isValid: false, status: "conflict", message: "Invalid date format" };
    }
  } catch (e) {
    return { isValid: false, status: "conflict", message: "Invalid date format" };
  }

  const bookingEndDateTime = addHours(bookingDateTime, 1);
  const now = new Date();
  const hoursUntilSession = differenceInHours(bookingDateTime, now);

  // Check for overlapping sessions (same logic as manage-session)
  let overlapQuery = supabaseClient
    .from('sessions')
    .select('id, session_date, status')
    .eq('trainer_id', trainerId)
    .gte('session_date', bookingDateTime.toISOString())
    .lt('session_date', bookingEndDateTime.toISOString())
    .not('status', 'in', '("cancelled", "no-show")');

  // Exclude a specific session if editing
  if (excludeSessionId) {
    overlapQuery = overlapQuery.neq('id', excludeSessionId);
  }

  const { data: overlappingSessions, error: overlapError } = await overlapQuery;

  if (overlapError) {
    console.error('[VALIDATION] Failed to check overlaps:', overlapError);
    return {
      isValid: false,
      status: "conflict",
      message: "Failed to check time slot availability"
    };
  }

  if (overlappingSessions && overlappingSessions.length > 0) {
    return {
      isValid: false,
      status: "conflict",
      message: "Timeslot already booked"
    };
  }

  // Check trainer availability using templates and exceptions
  const availabilityCheck = await checkTrainerAvailability(
    supabaseClient,
    trainerId,
    bookingDateTime
  );

  if (!availabilityCheck.isAvailable) {
    return {
      isValid: false,
      status: "conflict",
      message: availabilityCheck.message || "Trainer not available at this time"
    };
  }

  // Warning for sessions within 24-hour window
  if (hoursUntilSession < 24 && hoursUntilSession > 0) {
    return {
      isValid: true,
      status: "warning",
      message: "Within 24-hour booking window"
    };
  }

  // All checks passed
  return {
    isValid: true,
    status: "ok"
  };
}

/**
 * Check if trainer is available at the specified time
 * Based on availability templates and exceptions
 */
async function checkTrainerAvailability(
  supabaseClient: any,
  trainerId: string,
  sessionDate: Date
): Promise<{ isAvailable: boolean; message?: string }> {
  const dateStr = sessionDate.toISOString().split('T')[0];
  const dayOfWeek = sessionDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const sessionHour = sessionDate.getHours();
  const sessionMinute = sessionDate.getMinutes();

  // Fetch trainer's availability templates
  const { data: templates, error: templateError } = await supabaseClient
    .from('trainer_availability_templates')
    .select('day_of_week, start_time, end_time')
    .eq('trainer_id', trainerId);

  if (templateError) {
    console.error('[VALIDATION] Failed to fetch templates:', templateError);
    return { isAvailable: false, message: "Failed to check trainer availability" };
  }

  // Fetch exceptions for the specific date
  const { data: exceptions, error: exceptionError } = await supabaseClient
    .from('trainer_availability_exceptions')
    .select('exception_type, is_available, start_time, end_time')
    .eq('trainer_id', trainerId)
    .eq('exception_date', dateStr);

  if (exceptionError) {
    console.error('[VALIDATION] Failed to fetch exceptions:', exceptionError);
    return { isAvailable: false, message: "Failed to check trainer availability" };
  }

  // Check exceptions first (they override templates)
  if (exceptions && exceptions.length > 0) {
    for (const exception of exceptions) {
      // Full day unavailable
      if (exception.exception_type === 'unavailable_full_day' || exception.is_available === false) {
        return { isAvailable: false, message: "Trainer unavailable (blocked day)" };
      }

      // Partial day unavailable
      if (exception.exception_type === 'unavailable_partial_day') {
        const [exStartH, exStartM] = (exception.start_time || '00:00').split(':').map(Number);
        const [exEndH, exEndM] = (exception.end_time || '23:59').split(':').map(Number);
        
        const sessionMinutes = sessionHour * 60 + sessionMinute;
        const exStartMinutes = exStartH * 60 + exStartM;
        const exEndMinutes = exEndH * 60 + exEndM;

        if (sessionMinutes >= exStartMinutes && sessionMinutes < exEndMinutes) {
          return { isAvailable: false, message: "Trainer unavailable (blocked time)" };
        }
      }

      // Extra available slot
      if (exception.exception_type === 'available_extra_slot' || exception.is_available === true) {
        const [exStartH, exStartM] = (exception.start_time || '00:00').split(':').map(Number);
        const [exEndH, exEndM] = (exception.end_time || '23:59').split(':').map(Number);
        
        const sessionMinutes = sessionHour * 60 + sessionMinute;
        const exStartMinutes = exStartH * 60 + exStartM;
        const exEndMinutes = exEndH * 60 + exEndM;

        if (sessionMinutes >= exStartMinutes && sessionMinutes < exEndMinutes) {
          return { isAvailable: true }; // Available via exception
        }
      }
    }
  }

  // Check recurring templates
  if (!templates || templates.length === 0) {
    return { isAvailable: false, message: "No availability template for this day" };
  }

  // Convert day_of_week from templates (could be string like "monday" or number 1)
  const matchingTemplates = templates.filter(t => {
    if (typeof t.day_of_week === 'number') {
      return t.day_of_week === dayOfWeek;
    }
    // Handle string format (e.g., "monday")
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return t.day_of_week.toLowerCase() === dayNames[dayOfWeek];
  });

  if (matchingTemplates.length === 0) {
    return { isAvailable: false, message: "Trainer not available on this day" };
  }

  // Check if session time falls within any template slot
  for (const template of matchingTemplates) {
    const [startH, startM] = template.start_time.split(':').map(Number);
    const [endH, endM] = template.end_time.split(':').map(Number);
    
    const sessionMinutes = sessionHour * 60 + sessionMinute;
    const templateStartMinutes = startH * 60 + startM;
    const templateEndMinutes = endH * 60 + endM;

    // Session must start within template window and have room for 1-hour duration
    if (sessionMinutes >= templateStartMinutes && sessionMinutes + 60 <= templateEndMinutes) {
      return { isAvailable: true };
    }
  }

  return { isAvailable: false, message: "Time slot outside trainer availability" };
}

/**
 * Batch validation for multiple sessions
 * Used in recurring schedule preview/confirm
 */
export async function validateMultipleSessions(
  supabaseClient: any,
  trainerId: string,
  serviceTypeId: string,
  sessions: Array<{ utc: string; date: string; time: string }>
): Promise<Array<{ date: string; time: string; status: "ok" | "conflict" | "warning"; message?: string }>> {
  const results = [];

  for (const session of sessions) {
    const validation = await validateSessionAvailability(supabaseClient, {
      trainerId,
      sessionUtc: session.utc,
      serviceTypeId
    });

    results.push({
      date: session.date,
      time: session.time,
      status: validation.status,
      message: validation.message
    });
  }

  return results;
}
