// Phase 1: Client time preferences helper functions

import { supabase } from '@/integrations/supabase/client';
import { ClientTimePreference, CreateTimePreferenceInput } from '@/types/scheduling';

/**
 * Fetch current client_id from clients table based on authenticated user
 */
export async function getCurrentClientId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: client, error } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching current client:', error);
      return null;
    }

    return client?.id || null;
  } catch (error) {
    console.error('Error getting current client ID:', error);
    return null;
  }
}

/**
 * Fetch client time preferences for a specific client
 */
export async function fetchClientTimePreferences(clientId: string): Promise<ClientTimePreference[]> {
  const { data, error } = await supabase
    .from('client_time_preferences')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching client time preferences:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new time preference for a client
 */
export async function createTimePreference(
  clientId: string, 
  preference: CreateTimePreferenceInput
): Promise<ClientTimePreference> {
  const { data, error } = await supabase
    .from('client_time_preferences')
    .insert({
      client_id: clientId,
      weekday: preference.weekday,
      start_time: preference.start_time,
      end_time: preference.end_time || null,
      flex_minutes: preference.flex_minutes,
      notes: preference.notes || null,
      is_active: preference.is_active,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating time preference:', error);
    throw error;
  }

  return data;
}

/**
 * Update an existing time preference
 */
export async function updateTimePreference(
  preferenceId: string,
  updates: Partial<CreateTimePreferenceInput>
): Promise<ClientTimePreference> {
  const { data, error } = await supabase
    .from('client_time_preferences')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', preferenceId)
    .select()
    .single();

  if (error) {
    console.error('Error updating time preference:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a time preference
 */
export async function deleteTimePreference(preferenceId: string): Promise<void> {
  const { error } = await supabase
    .from('client_time_preferences')
    .delete()
    .eq('id', preferenceId);

  if (error) {
    console.error('Error deleting time preference:', error);
    throw error;
  }
}

/**
 * Toggle active status of a time preference
 */
export async function toggleTimePreferenceActive(
  preferenceId: string, 
  isActive: boolean
): Promise<ClientTimePreference> {
  const { data, error } = await supabase
    .from('client_time_preferences')
    .update({ 
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', preferenceId)
    .select()
    .single();

  if (error) {
    console.error('Error toggling time preference active status:', error);
    throw error;
  }

  return data;
}

/**
 * Validate time preference input
 */
export function validateTimePreference(preference: CreateTimePreferenceInput): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate weekday
  if (preference.weekday < 0 || preference.weekday > 6) {
    errors.push('Invalid weekday');
  }

  // Validate time format (HH:mm:ss or HH:mm)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:00)?$/;
  if (!timeRegex.test(preference.start_time)) {
    errors.push('Invalid start time format');
  }

  if (preference.end_time && !timeRegex.test(preference.end_time)) {
    errors.push('Invalid end time format');
  }

  // Validate that end time is after start time
  if (preference.end_time) {
    const start = new Date(`2000-01-01 ${preference.start_time}`);
    const end = new Date(`2000-01-01 ${preference.end_time}`);
    if (end <= start) {
      errors.push('End time must be after start time');
    }
  }

  // Validate flex minutes
  if (preference.flex_minutes < 0 || preference.flex_minutes > 180) {
    errors.push('Flex minutes must be between 0 and 180');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}