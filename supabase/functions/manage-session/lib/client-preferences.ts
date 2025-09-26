// Phase 1: Edge Function helper for client preferences
// Will be used in Phase 2 for recurring session generation

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ClientTimePreference {
  id: string;
  client_id: string;
  weekday: number; // 0-6, Sunday=0
  start_time: string; // HH:mm:ss format
  end_time?: string; // Optional HH:mm:ss format  
  flex_minutes: number; // 0-180
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch active client preferred time slots
 * @param supabaseClient - Supabase client instance
 * @param clientId - Client UUID
 * @returns Array of active client time preferences
 */
export async function fetchClientPreferredSlots(
  supabaseClient: SupabaseClient,
  clientId: string
): Promise<ClientTimePreference[]> {
  const { data, error } = await supabaseClient
    .from('client_time_preferences')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[client-preferences] Error fetching preferred slots:', error);
    throw new Error(`Failed to fetch client preferences: ${error.message}`);
  }

  return data || [];
}

/**
 * Check if a given date/time matches any of the client's preferred slots
 * @param preferences - Array of client time preferences
 * @param proposedDate - Date to check (used to determine weekday)
 * @param proposedTime - Time to check (HH:mm format)
 * @returns Matching preference or null
 */
export function findMatchingPreference(
  preferences: ClientTimePreference[],
  proposedDate: Date,
  proposedTime: string // HH:mm format
): ClientTimePreference | null {
  const weekday = proposedDate.getDay(); // 0=Sunday, 1=Monday, etc.
  const proposedTimeInMinutes = timeToMinutes(proposedTime);

  return preferences.find(pref => {
    if (pref.weekday !== weekday) return false;

    const startTimeInMinutes = timeToMinutes(pref.start_time.slice(0, 5));
    const flexMinutes = pref.flex_minutes;

    // Check if proposed time is within start time ± flex_minutes
    const earliestAcceptable = startTimeInMinutes - flexMinutes;
    const latestAcceptable = startTimeInMinutes + flexMinutes;

    return proposedTimeInMinutes >= earliestAcceptable && 
           proposedTimeInMinutes <= latestAcceptable;
  }) || null;
}

/**
 * Get next available slot for a client based on their preferences
 * @param preferences - Array of client time preferences  
 * @param fromDate - Start searching from this date
 * @param weeksAhead - How many weeks to search ahead (default: 4)
 * @returns Next available preferred slot or null
 */
export function getNextPreferredSlot(
  preferences: ClientTimePreference[],
  fromDate: Date = new Date(),
  weeksAhead: number = 4
): { date: Date; preference: ClientTimePreference } | null {
  const searchEndDate = new Date(fromDate);
  searchEndDate.setDate(searchEndDate.getDate() + (weeksAhead * 7));

  const currentDate = new Date(fromDate);
  
  while (currentDate <= searchEndDate) {
    const weekday = currentDate.getDay();
    
    // Find preference for this weekday
    const dayPreferences = preferences.filter(pref => pref.weekday === weekday);
    
    if (dayPreferences.length > 0) {
      // Return the earliest preference for this day
      // (preferences are already sorted by start_time)
      return {
        date: new Date(currentDate),
        preference: dayPreferences[0]
      };
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return null;
}

/**
 * Convert time string (HH:mm or HH:mm:ss) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Validate that client preferences don't have overlapping time windows on the same weekday
 * Mirrors the UI validation for defense in depth
 */
export function validateNoOverlaps(prefs: ClientTimePreference[]): { isValid: boolean; message?: string } {
  const days = new Map<number, Array<{start: string; end: string}>>();
  const toRange = (s: string, e?: string) => ({ start: s.slice(0,5), end: (e?.slice(0,5)) || s.slice(0,5) });
  const overlaps = (a:any,b:any) => !(a.end <= b.start || b.end <= a.start);
  for (const p of prefs) {
    const arr = days.get(p.weekday) ?? [];
    arr.push(toRange(p.start_time, p.end_time));
    days.set(p.weekday, arr);
  }
  for (const [, ranges] of days) {
    ranges.sort((a,b)=> a.start.localeCompare(b.start));
    for (let i=1;i<ranges.length;i++) {
      if (overlaps(ranges[i-1], ranges[i])) return { isValid:false, message:'Overlapping times on the same day are not allowed.' };
    }
  }
  return { isValid:true };
}

/**
 * Validate if client preferences conflict with trainer availability
 * Reserved for Phase 2 - will integrate with existing availability logic
 */
export function validatePreferencesAgainstAvailability(
  preferences: ClientTimePreference[],
  trainerAvailability: any[] // Will be properly typed in Phase 2
): { isValid: boolean; conflicts: string[] } {
  // Placeholder for Phase 2 implementation
  return {
    isValid: true,
    conflicts: []
  };
}

// Self-test for validateNoOverlaps function in dev environment
if (Deno.env.get('ENV') === 'dev') {
  // Test case 1: No overlaps should pass
  const validPrefs: ClientTimePreference[] = [
    { id: '1', client_id: 'test', weekday: 1, start_time: '09:00:00', end_time: '10:00:00', flex_minutes: 0, is_active: true, created_at: '', updated_at: '' },
    { id: '2', client_id: 'test', weekday: 1, start_time: '11:00:00', end_time: '12:00:00', flex_minutes: 0, is_active: true, created_at: '', updated_at: '' }
  ];
  const validResult = validateNoOverlaps(validPrefs);
  console.log('[validateNoOverlaps] Test 1 (no overlaps):', validResult.isValid ? 'PASS' : 'FAIL');

  // Test case 2: Overlapping times should fail
  const invalidPrefs: ClientTimePreference[] = [
    { id: '1', client_id: 'test', weekday: 1, start_time: '09:00:00', end_time: '11:00:00', flex_minutes: 0, is_active: true, created_at: '', updated_at: '' },
    { id: '2', client_id: 'test', weekday: 1, start_time: '10:00:00', end_time: '12:00:00', flex_minutes: 0, is_active: true, created_at: '', updated_at: '' }
  ];
  const invalidResult = validateNoOverlaps(invalidPrefs);
  console.log('[validateNoOverlaps] Test 2 (overlapping):', !invalidResult.isValid ? 'PASS' : 'FAIL');
}