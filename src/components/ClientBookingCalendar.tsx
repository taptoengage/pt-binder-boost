import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDay, startOfMonth, endOfMonth, eachDayOfInterval, addDays, setHours, setMinutes, isSameDay } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface AvailableSlot {
  start: Date;
  end: Date;
}

interface TrainerTemplate {
  day_of_week: number; // 0 for Sunday, 1 for Monday, ..., 6 for Saturday (standard JS Date.getDay())
  start_time: string; // e.g., "09:00:00"
  end_time: string;   // e.g., "17:00:00"
}

interface TrainerException {
  exception_date: string; // e.g., "2025-08-15"
  start_time: string;
  end_time: string;
  is_available: boolean; // true = add slot, false = remove slot
}

interface ClientBookingCalendarProps {
  trainerId: string;
}

export default function ClientBookingCalendar({ trainerId }: ClientBookingCalendarProps) {
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState(new Date()); // Controls month shown on calendar
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to map string day names to numbers (0=Sun, 1=Mon...)
  const getDayNumberFromString = (dayName: string): number | undefined => {
    switch (dayName.toLowerCase()) {
      case 'sunday': return 0;
      case 'monday': return 1;
      case 'tuesday': return 2;
      case 'wednesday': return 3;
      case 'thursday': return 4;
      case 'friday': return 5;
      case 'saturday': return 6;
      default: return undefined; // Handle unexpected values
    }
  };

  // Helper function to parse 'HH:MM:SS' time string into hours and minutes
  const parseTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return { hours, minutes };
  };

  // CORE LOGIC: Combines templates and exceptions to get final available slots for a month
  const combineAndCalculateAvailability = useCallback((
    templates: TrainerTemplate[],
    exceptions: TrainerException[],
    startDate: Date,
    endDate: Date
  ): AvailableSlot[] => {
    const finalSlots: AvailableSlot[] = [];
    const daysInInterval = eachDayOfInterval({ start: startDate, end: endDate });

    daysInInterval.forEach(day => {
      const dayOfWeek = getDay(day); // 0 = Sunday, 1 = Monday, etc.

      let dailySlots: AvailableSlot[] = [];

      // 1. Apply recurring templates for the current day of week
      templates.filter(t => t.day_of_week === dayOfWeek).forEach(template => {
        const { hours: startHours, minutes: startMinutes } = parseTime(template.start_time);
        const { hours: endHours, minutes: endMinutes } = parseTime(template.end_time);

        let startDateTime = setMinutes(setHours(day, startHours), startMinutes);
        let endDateTime = setMinutes(setHours(day, endHours), endMinutes);

        dailySlots.push({ start: startDateTime, end: endDateTime });
      });

      // 2. Apply exceptions for the current day
      exceptions.filter(e => isSameDay(new Date(e.exception_date), day)).forEach(exception => {
        if (exception.is_available === false) {
          // Remove slots for this day (clear all existing daily slots)
          dailySlots = []; // If an exception is_available=false, it typically means no availability for that day
        } else if (exception.is_available === true) {
          // Add specific slots for this day (overrides default removal or adds to existing)
          const { hours: startHours, minutes: startMinutes } = parseTime(exception.start_time);
          const { hours: endHours, minutes: endMinutes } = parseTime(exception.end_time);

          let startDateTime = setMinutes(setHours(day, startHours), startMinutes);
          let endDateTime = setMinutes(setHours(day, endHours), endMinutes);

          dailySlots.push({ start: startDateTime, end: endDateTime });
        }
      });

      // Filter out slots that end before they start or are invalid
      dailySlots = dailySlots.filter(slot => slot.start < slot.end);

      // Add processed daily slots to final list
      finalSlots.push(...dailySlots);
    });

    // Sort by start time for consistent display
    return finalSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, []); // Dependencies: None, as all data comes from args

  useEffect(() => {
    const fetchAndProcessAvailability = async () => {
      // DEBUG LOG 1: Check the trainerId prop received
      console.log('DEBUG: Calendar received trainerId:', trainerId);

      if (!trainerId) {
        setAvailableSlots([]);
        setIsLoadingAvailability(false);
        // DEBUG LOG 2: Log if trainerId is null
        console.log('DEBUG: Calendar received null trainerId, stopping availability fetch.');
        return;
      }

      setIsLoadingAvailability(true);
      setError(null);

      try {
        const startDate = startOfMonth(currentDisplayMonth);
        const endDate = endOfMonth(currentDisplayMonth);

        // DEBUG LOG 3: Log the date range for the query
        console.log('DEBUG: Fetching availability for date range:', { start: startDate.toISOString(), end: endDate.toISOString() });

        // 1. Fetch Templates
        const { data: templatesData, error: templatesError } = await supabase
          .from('trainer_availability_templates')
          .select('day_of_week, start_time, end_time')
          .eq('trainer_id', trainerId);

        // DEBUG LOG 4: Log the results of the templates query
        console.log('DEBUG: Templates query result:', { data: templatesData, error: templatesError });

        if (templatesError) throw templatesError;

        // Convert day_of_week from string name to number for templates
        const templates = (templatesData || []).map(template => {
          const dayNumber = getDayNumberFromString(template.day_of_week);
          if (dayNumber === undefined) {
            console.warn(`Unknown day_of_week string in template: ${template.day_of_week}`);
            return null; // Filter out invalid entries
          }
          return {
            ...template,
            day_of_week: dayNumber
          };
        }).filter(Boolean) as TrainerTemplate[]; // Filter out nulls and cast

        // 2. Fetch Exceptions for the given date range
        const { data: exceptions, error: exceptionsError } = await supabase
          .from('trainer_availability_exceptions')
          .select('exception_date, start_time, end_time, is_available')
          .eq('trainer_id', trainerId)
          .gte('exception_date', startDate.toISOString().split('T')[0])
          .lte('exception_date', endDate.toISOString().split('T')[0]);

        // DEBUG LOG 5: Log the results of the exceptions query
        console.log('DEBUG: Exceptions query result:', { data: exceptions, error: exceptionsError });

        if (exceptionsError) throw exceptionsError;

        // 3. Combine and Calculate Final Available Slots
        const processedSlots = combineAndCalculateAvailability(
          templates,
          exceptions || [],
          startDate,
          endDate
        );

        setAvailableSlots(processedSlots);
        // DEBUG LOG 6: Log the final processed slots
        console.log('DEBUG: Final processed available slots:', processedSlots);

      } catch (err: any) {
        console.error('Error fetching or processing trainer availability:', err.message);
        setError('Failed to load trainer availability.');
      } finally {
        setIsLoadingAvailability(false);
      }
    };

    fetchAndProcessAvailability();
  }, [trainerId, currentDisplayMonth, combineAndCalculateAvailability]); // Dependencies for useEffect

  const handleNextMonth = () => {
    setCurrentDisplayMonth(prevMonth => addDays(prevMonth, 30)); // Simple month advance
  };

  const handlePrevMonth = () => {
    setCurrentDisplayMonth(prevMonth => addDays(prevMonth, -30)); // Simple month advance
  };

  if (isLoadingAvailability) {
    return (
      <Card className="mb-8">
        <CardContent className="p-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 
          Loading availability...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-8">
        <CardContent className="p-4 text-destructive">
          Error: {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Book a Session</CardTitle>
        <CardDescription>View your trainer's available time slots.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <Button onClick={handlePrevMonth} variant="outline">Previous</Button>
          <h3 className="text-xl font-semibold">{format(currentDisplayMonth, 'MMMM yyyy')}</h3>
          <Button onClick={handleNextMonth} variant="outline">Next</Button>
        </div>

        <div className="space-y-4">
          {availableSlots.length > 0 ? (
            // This is a placeholder for your actual calendar UI.
            // You would typically integrate react-calendar, react-big-calendar, etc. here.
            // For now, it lists the slots.
            availableSlots.map((slot, index) => (
              <div key={index} className="border border-border p-2 rounded flex justify-between items-center">
                <span>{format(slot.start, 'MMM dd, yyyy - h:mm a')} to {format(slot.end, 'h:mm a')}</span>
                {/* Booking button will go here in a future prompt */}
                <Button size="sm">Book</Button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">No available slots for this month.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}