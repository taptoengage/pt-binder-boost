import { format, getDay, isSameDay, setHours, setMinutes, parse, addMinutes, isBefore, eachDayOfInterval } from 'date-fns';

// Helper function to parse 'HH:MM:SS' or 'HH:MM' time string into hours and minutes
export const parseTime = (timeString: string) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return { hours, minutes };
};

// Helper function to generate 30-minute time slots for a day
export const generateDayTimeSlots = () => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(format(setMinutes(setHours(new Date(), h), m), 'HH:mm'));
    }
  }
  return slots;
};

// Helper function to map string day names to numbers (0=Sun, 1=Mon...)\
export const getDayNumberFromString = (dayName: string): number | undefined => {
  switch (dayName.toLowerCase()) {
    case 'sunday': return 0;
    case 'monday': return 1;
    case 'tuesday': return 2;
    case 'wednesday': return 3;
    case 'thursday': return 4;
    case 'friday': return 5;
    case 'saturday': return 6;
    default: return undefined;
  }
};

// Interface definitions
export interface AvailableSlot {
  start: Date;
  end: Date;
}

export interface TrainerTemplate {
  day_of_week: number | string; // Can be either number or string depending on source
  start_time: string;
  end_time: string;
}

export interface TrainerException {
  exception_date: string;
  start_time: string;
  end_time: string;
  is_available?: boolean; // For ClientBookingCalendar compatibility
  exception_type?: string; // For ViewSchedule compatibility
}

export interface BookedSession {
  session_date: string;
  status: string;
}

// Unified availability calculation function
// Supports both ClientBookingCalendar (with is_available) and ViewSchedule (with exception_type) formats
export const calculateEffectiveAvailability = (
  templates: TrainerTemplate[],
  exceptions: TrainerException[],
  sessions: BookedSession[],
  startDate: Date,
  endDate: Date
): AvailableSlot[] => {
  const finalSlots: AvailableSlot[] = [];
  const daysInInterval = eachDayOfInterval({ start: startDate, end: endDate });

  daysInInterval.forEach(day => {
    const dayOfWeek = getDay(day); // 0 = Sunday, 1 = Monday, etc.
    const dayOfWeekLowercase = format(day, 'EEEE').toLowerCase();

    let dailySlots: AvailableSlot[] = [];

    // 1. Apply recurring templates for the current day of week
    templates.forEach(template => {
      let templateDayOfWeek: number;
      
      // Handle both number and string formats
      if (typeof template.day_of_week === 'string') {
        const dayNumber = getDayNumberFromString(template.day_of_week);
        if (dayNumber === undefined) return; // Skip invalid day names
        templateDayOfWeek = dayNumber;
      } else {
        templateDayOfWeek = template.day_of_week;
      }

      // Also check string format for ViewSchedule compatibility
      if (templateDayOfWeek === dayOfWeek || template.day_of_week === dayOfWeekLowercase) {
        const { hours: startHours, minutes: startMinutes } = parseTime(template.start_time);
        const { hours: endHours, minutes: endMinutes } = parseTime(template.end_time);

        const startDateTime = setMinutes(setHours(day, startHours), startMinutes);
        const endDateTime = setMinutes(setHours(day, endHours), endMinutes);

        dailySlots.push({ start: startDateTime, end: endDateTime });
      }
    });

    // 2. Apply exceptions for the current day
    const exceptionsForDay = exceptions.filter(e => isSameDay(new Date(e.exception_date), day));
    
    exceptionsForDay.forEach(exception => {
      const exceptionDateRef = new Date(exception.exception_date);

      // Handle ClientBookingCalendar format (is_available)
      if (exception.is_available !== undefined) {
        if (exception.is_available === false) {
          // Remove slots for this day (clear all existing daily slots)
          dailySlots = [];
        } else if (exception.is_available === true) {
          // Add specific slots for this day
          const { hours: startHours, minutes: startMinutes } = parseTime(exception.start_time);
          const { hours: endHours, minutes: endMinutes } = parseTime(exception.end_time);

          const startDateTime = setMinutes(setHours(day, startHours), startMinutes);
          const endDateTime = setMinutes(setHours(day, endHours), endMinutes);

          dailySlots.push({ start: startDateTime, end: endDateTime });
        }
      }

      // Handle ViewSchedule format (exception_type)
      if (exception.exception_type) {
        if (exception.exception_type === 'unavailable_full_day') {
          dailySlots = [];
        } else if (exception.exception_type === 'unavailable_partial_day') {
          const unavailableStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
          const unavailableEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

          const newRangesAfterPartialRemoval: AvailableSlot[] = [];
          dailySlots.forEach(range => {
            if (range.start < unavailableEnd && range.end > unavailableStart) {
              if (range.start < unavailableStart) {
                newRangesAfterPartialRemoval.push({ start: range.start, end: unavailableStart });
              }
              if (range.end > unavailableEnd) {
                newRangesAfterPartialRemoval.push({ start: unavailableEnd, end: range.end });
              }
            } else {
              newRangesAfterPartialRemoval.push(range);
            }
          });
          dailySlots = newRangesAfterPartialRemoval;
        } else if (exception.exception_type === 'available_extra_slot') {
          const extraStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
          const extraEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

          dailySlots.push({ start: extraStart, end: extraEnd });

          // Re-merge after adding extra slot
          dailySlots.sort((a, b) => a.start.getTime() - b.start.getTime());
          const tempMerged: AvailableSlot[] = [];
          if (dailySlots.length > 0) {
            let lastTempMerged = dailySlots[0];
            for (let i = 1; i < dailySlots.length; i++) {
              if (dailySlots[i].start.getTime() <= lastTempMerged.end.getTime()) {
                lastTempMerged.end = new Date(Math.max(lastTempMerged.end.getTime(), dailySlots[i].end.getTime()));
              } else {
                tempMerged.push(lastTempMerged);
                lastTempMerged = dailySlots[i];
              }
            }
            tempMerged.push(lastTempMerged);
          }
          dailySlots = tempMerged;
        }
      }
    });

    // 3. Subtract booked sessions from available slots
    const sessionsForDay = sessions.filter(s => isSameDay(new Date(s.session_date), day));
    
    if (sessionsForDay.length > 0) {
      let updatedSlots: AvailableSlot[] = [];
      
      dailySlots.forEach(availableSlot => {
        let currentSlots = [availableSlot];
        
        sessionsForDay.forEach(bookedSession => {
          const bookedStart = new Date(bookedSession.session_date);
          const bookedEnd = new Date(bookedStart.getTime() + 60 * 60 * 1000); // 1 hour sessions
          
          const newCurrentSlots: AvailableSlot[] = [];
          
          currentSlots.forEach(slot => {
            // If booked session doesn't overlap with this slot, keep it
            if (bookedEnd <= slot.start || bookedStart >= slot.end) {
              newCurrentSlots.push(slot);
            } else {
              // Split the slot around the booked session
              if (slot.start < bookedStart) {
                newCurrentSlots.push({ start: slot.start, end: bookedStart });
              }
              if (bookedEnd < slot.end) {
                newCurrentSlots.push({ start: bookedEnd, end: slot.end });
              }
            }
          });
          
          currentSlots = newCurrentSlots;
        });
        
        updatedSlots.push(...currentSlots);
      });
      
      dailySlots = updatedSlots;
    }

    // Filter out slots that end before they start or are invalid
    dailySlots = dailySlots.filter(slot => slot.start < slot.end);

    // Add processed daily slots to final list
    finalSlots.push(...dailySlots);
  });

  // Sort by start time for consistent display
  return finalSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
};
