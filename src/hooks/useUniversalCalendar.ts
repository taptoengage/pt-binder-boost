import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, addDays } from 'date-fns';
import { calculateEffectiveAvailability, AvailableSlot } from '@/lib/availabilityUtils';

export interface UseUniversalCalendarProps {
  trainerId?: string;
  initialView?: 'week' | 'month' | 'day';
  initialDate?: Date;
  enabled?: boolean;
}

export interface UseUniversalCalendarReturn {
  // State
  currentDisplayMonth: Date;
  selectedDate: Date;
  view: 'week' | 'month' | 'day';
  availableSlots: AvailableSlot[];
  
  // Loading states
  isLoading: boolean;
  isLoadingTemplates: boolean;
  isLoadingExceptions: boolean;
  isLoadingSessions: boolean;
  
  // Error states
  error: string | null;
  
  // Handlers
  handleNextMonth: () => void;
  handlePrevMonth: () => void;
  handleViewChange: (newView: 'week' | 'month' | 'day') => void;
  handleDayClick: (date: Date) => void;
  
  // Data
  templates: any[];
  exceptions: any[];
  sessions: any[];
}

export const useUniversalCalendar = ({
  trainerId,
  initialView = 'week',
  initialDate = new Date(),
  enabled = true
}: UseUniversalCalendarProps): UseUniversalCalendarReturn => {
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState(initialDate);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [view, setView] = useState<'week' | 'month' | 'day'>(initialView);
  const [error, setError] = useState<string | null>(null);

  // Fetch trainer availability templates
  const { data: templates = [], isLoading: isLoadingTemplates, error: templatesError } = useQuery({
    queryKey: ['trainerAvailabilityTemplates', trainerId],
    queryFn: async () => {
      if (!trainerId) return [];
      const { data, error } = await supabase
        .from('trainer_availability_templates')
        .select('day_of_week, start_time, end_time')
        .eq('trainer_id', trainerId);

      if (error) throw error;

      // Convert day_of_week from string name to number for compatibility
      return (data || []).map(template => {
        let dayNumber: number;
        if (typeof template.day_of_week === 'string') {
          switch (template.day_of_week.toLowerCase()) {
            case 'sunday': dayNumber = 0; break;
            case 'monday': dayNumber = 1; break;
            case 'tuesday': dayNumber = 2; break;
            case 'wednesday': dayNumber = 3; break;
            case 'thursday': dayNumber = 4; break;
            case 'friday': dayNumber = 5; break;
            case 'saturday': dayNumber = 6; break;
            default: 
              console.warn(`Unknown day_of_week string: ${template.day_of_week}`);
              return null;
          }
        } else {
          dayNumber = template.day_of_week;
        }
        return {
          ...template,
          day_of_week: dayNumber
        };
      }).filter(Boolean);
    },
    enabled: enabled && !!trainerId,
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  // Fetch trainer availability exceptions
  const { data: exceptions = [], isLoading: isLoadingExceptions, error: exceptionsError } = useQuery({
    queryKey: ['trainerAvailabilityExceptions', trainerId, currentDisplayMonth],
    queryFn: async () => {
      if (!trainerId) return [];
      
      const startDate = startOfMonth(currentDisplayMonth);
      const endDate = endOfMonth(currentDisplayMonth);
      
      const { data, error } = await supabase
        .from('trainer_availability_exceptions')
        .select('exception_date, start_time, end_time, is_available, exception_type')
        .eq('trainer_id', trainerId)
        .gte('exception_date', startDate.toISOString().split('T')[0])
        .lte('exception_date', endDate.toISOString().split('T')[0]);

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!trainerId,
    staleTime: 60 * 1000, // Cache for 1 minute
  });

  // Fetch booked sessions using secure RPC
  const { data: sessions = [], isLoading: isLoadingSessions, error: sessionsError } = useQuery({
    queryKey: ['trainerBusySlots', trainerId, currentDisplayMonth],
    queryFn: async () => {
      if (!trainerId) return [];
      
      const startDate = startOfMonth(currentDisplayMonth);
      const endDate = endOfMonth(currentDisplayMonth);
      
      const payload = {
        p_trainer_id: trainerId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString(),
      };
      
      const { data, error } = await supabase.rpc('get_trainer_busy_slots', payload);

      if (error) throw error;
      
      // Filter to current month and transform to match expected format
      const filteredSessions = (data || []).filter((session: any) => {
        const sessionDate = new Date(session.session_date);
        return sessionDate >= startDate && sessionDate <= endDate && session.trainer_id === trainerId;
      }).map((session: any) => ({
        session_date: session.session_date,
        status: 'scheduled' // RPC only returns scheduled/completed sessions
      }));
      
      return filteredSessions;
    },
    enabled: enabled && !!trainerId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  // Calculate available slots using the unified availability calculation
  const availableSlots = useMemo(() => {
    if (!trainerId || !templates.length) return [];
    
    const startDate = startOfMonth(currentDisplayMonth);
    const endDate = endOfMonth(currentDisplayMonth);
    
    return calculateEffectiveAvailability(
      templates,
      exceptions,
      sessions,
      startDate,
      endDate
    );
  }, [trainerId, templates, exceptions, sessions, currentDisplayMonth]);

  // Handle errors
  useEffect(() => {
    if (templatesError) {
      setError(`Failed to load availability templates: ${templatesError.message}`);
    } else if (exceptionsError) {
      setError(`Failed to load availability exceptions: ${exceptionsError.message}`);
    } else if (sessionsError) {
      setError(`Failed to load sessions: ${sessionsError.message}`);
    } else {
      setError(null);
    }
  }, [templatesError, exceptionsError, sessionsError]);

  // Handlers
  const handleNextMonth = useCallback(() => {
    setCurrentDisplayMonth(prevMonth => addDays(prevMonth, 30));
  }, []);

  const handlePrevMonth = useCallback(() => {
    setCurrentDisplayMonth(prevMonth => addDays(prevMonth, -30));
  }, []);

  const handleViewChange = useCallback((newView: 'week' | 'month' | 'day') => {
    setView(newView);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    setSelectedDate(date);
    setView('day');
  }, []);

  const isLoading = isLoadingTemplates || isLoadingExceptions || isLoadingSessions;

  return {
    // State
    currentDisplayMonth,
    selectedDate,
    view,
    availableSlots,
    
    // Loading states
    isLoading,
    isLoadingTemplates,
    isLoadingExceptions,
    isLoadingSessions,
    
    // Error states
    error,
    
    // Handlers
    handleNextMonth,
    handlePrevMonth,
    handleViewChange,
    handleDayClick,
    
    // Data
    templates,
    exceptions,
    sessions,
  };
};