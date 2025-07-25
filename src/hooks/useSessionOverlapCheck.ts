// src/hooks/useSessionOverlapCheck.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { addMinutes, setHours, setMinutes } from 'date-fns';
import { z } from 'zod'; // Import z for Zod refinement context

const DEFAULT_SESSION_DURATION_MINUTES = 60; // Universal duration assumption

// Interface for the custom hook's props
interface UseSessionOverlapCheckProps {
  trainerId: string | undefined;
  proposedDate: Date | undefined;
  proposedTime: string | undefined;
  proposedStatus: 'scheduled' | 'completed' | 'cancelled_late' | 'cancelled_early' | undefined;
  sessionIdToExclude?: string; // Optional: for editing existing sessions, exclude self
  enabled: boolean; // Control when the query runs
}

// Custom Hook for Overlap Check
export const useSessionOverlapCheck = ({
  trainerId,
  proposedDate,
  proposedTime,
  proposedStatus,
  sessionIdToExclude,
  enabled,
}: UseSessionOverlapCheckProps) => {

  const { data: overlappingSessions, isLoading: isLoadingOverlaps } = useQuery({
    queryKey: ['sessionOverlaps', trainerId, proposedDate?.toISOString(), proposedTime, proposedStatus, sessionIdToExclude],
    queryFn: async () => {
      // Only query if trainerId, proposedDate, proposedTime are defined and status is 'scheduled'
      if (!trainerId || !proposedDate || !proposedTime || proposedStatus !== 'scheduled') {
        return [];
      }

      // Calculate proposed session start and end times
      const [hours, minutes] = proposedTime.split(':').map(Number);
      const proposedStart = setMinutes(setHours(proposedDate, hours), minutes);
      const proposedEnd = addMinutes(proposedStart, DEFAULT_SESSION_DURATION_MINUTES);

      let query = supabase
        .from('sessions')
        .select('id, session_date, session_time')
        .eq('trainer_id', trainerId)
        // Only consider sessions that are 'scheduled' or 'completed' as potential overlaps
        .in('status', ['scheduled', 'completed']);

      if (sessionIdToExclude) {
        query = query.neq('id', sessionIdToExclude); // Exclude the current session being edited
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching overlapping sessions:", error);
        throw error;
      }

      // Client-side filtering for actual time overlap
      const overlaps = data.filter((existingSession: any) => {
        const existingStart = new Date(`${existingSession.session_date}T${existingSession.session_time}:00`);
        const existingEnd = addMinutes(existingStart, DEFAULT_SESSION_DURATION_MINUTES);

        // Check for overlap: [start1, end1) overlaps [start2, end2) if start1 < end2 AND end1 > start2
        return proposedStart < existingEnd && proposedEnd > existingStart;
      });

      return overlaps;
    },
    enabled: enabled && proposedStatus === 'scheduled', // Only enable if enabled prop is true AND status is scheduled
    staleTime: 0, // Always get fresh data for validation
  });

  const overlappingSessionsCount = overlappingSessions?.length || 0;

  return { isLoadingOverlaps, overlappingSessionsCount };
};

// Reusable Zod superRefine validation function
export const validateOverlap = (
  // Use a more generic type for `data` that covers common fields in both schemas
  data: { status: 'scheduled' | 'completed' | 'cancelled_late' | 'cancelled_early'; session_date: Date; session_time: string; },
  ctx: z.RefinementCtx, // Zod refinement context
  isLoadingOverlaps: boolean,
  overlappingSessionsCount: number | undefined
) => {
  if (data.status === 'scheduled') { // Only apply overlap check if the session is scheduled
    if (isLoadingOverlaps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Checking for time overlaps...",
        path: ['session_time'], // Link to time field
      });
      return;
    }

    if (overlappingSessionsCount !== undefined && overlappingSessionsCount > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This time slot overlaps with another scheduled session.",
        path: ['session_time'], // Link error to time field
      });
    }
  }
};