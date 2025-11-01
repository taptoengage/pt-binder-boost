import { supabase } from '@/integrations/supabase/client';

interface GenerateScheduleParams {
  action: 'preview' | 'confirm';
  trainerId: string;
  clientId: string;
  preferenceIds: string[];
  startDate: string;
  endDate: string;
  bookingMethod: 'one-off' | 'pack' | 'subscription';
  sessionPackId?: string;
  subscriptionId?: string;
  serviceTypeId: string;
  patternName?: string;
  excludedSessions?: Array<{ date: string; time: string }>;
}

export function useRecurringScheduleGeneration() {
  const generateSchedule = async (params: GenerateScheduleParams) => {
    console.log('[useRecurringScheduleGeneration] Request:', params);
    
    const { data, error } = await supabase.functions.invoke(
      'generate-recurring-sessions',
      { body: params }
    );
    
    console.log('[useRecurringScheduleGeneration] Response:', { data, error });
    
    return { data, error };
  };

  return { generateSchedule };
}
