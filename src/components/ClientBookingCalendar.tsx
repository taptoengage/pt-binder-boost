import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, getDay, startOfMonth, endOfMonth, eachDayOfInterval, addDays, setHours, setMinutes, isSameDay, startOfWeek, endOfWeek, isToday, isAfter, isBefore, addMinutes, isWithinInterval, addWeeks, subWeeks } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Calendar, momentLocalizer, View } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import UniversalSessionModal from '@/components/UniversalSessionModal';
import ScheduleListView from '@/components/schedule/ScheduleListView';
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useBusySlots } from "@/hooks/useBusySlots";

// Helper functions for mobile week view
const getSlotsForDate = (date: Date, slots: { start: Date; end: Date }[]) => {
  return slots.filter((s) => isSameDay(new Date(s.start), date));
};

const getDisplayedWeek = (anchor: Date) => {
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
};

const localizer = momentLocalizer(moment);

// Enable micro-interactions
const ENABLE_VIBRATION = true;

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
  clientId: string;
}

export default function ClientBookingCalendar({ trainerId, clientId }: ClientBookingCalendarProps) {
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState(new Date());
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'week' | 'month' | 'day'>('week');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlotForModal, setSelectedSlotForModal] = useState<{ start: Date; end: Date } | null>(null);
  const [bookedSessions, setBookedSessions] = useState<any[]>([]);
  const [lastSelectedDate, setLastSelectedDate] = useState<Date | null>(null);
  const isMobile = useIsMobile();
  const tilesContainerRef = useRef<HTMLDivElement>(null);

  // Compute visible window based on current view
  const weekStartsOn: 0 | 1 = 1; // Monday start (match Trainer view)

  const windowStart = useMemo(() =>
    view === "week"
      ? startOfWeek(selectedDate, { weekStartsOn })
      : startOfMonth(currentDisplayMonth),
    [view, selectedDate, currentDisplayMonth]
  );

  const windowEnd = useMemo(() =>
    view === "week"
      ? endOfWeek(selectedDate, { weekStartsOn })
      : endOfMonth(currentDisplayMonth),
    [view, selectedDate, currentDisplayMonth]
  );

  // UUID validation for trainerId
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isValidTrainerId = trainerId && UUID_RE.test(String(trainerId));

  // Fetch busy slots via RPC hook - only enabled when we have a valid UUID
  const { busy, loading: busyLoading, error: busyError, refetch: refetchBusy } =
    useBusySlots(trainerId, windowStart, windowEnd, Boolean(isValidTrainerId));

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
    sessions: any[],
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
  }, []); // Dependencies: None, as all data comes from args

  useEffect(() => {
    const fetchAndProcessAvailability = async () => {
      if (!isValidTrainerId) {
        setAvailableSlots([]);
        setIsLoadingAvailability(false);
        console.log('[ClientBookingCalendar] Invalid or missing trainerId, stopping availability fetch', {
          trainerId,
          isValid: isValidTrainerId
        });
        return;
      }

      // Stop loading if busyError exists
      if (busyError) {
        setIsLoadingAvailability(false);
        setError(busyError);
        return;
      }

      setIsLoadingAvailability(true);
      setError(null);

      try {
        const startDate = windowStart;
        const endDate = windowEnd;

        // Temporary diagnostics
        console.log("[ClientCalendar] Window", windowStart.toISOString(), windowEnd.toISOString());

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

        // 3. Use busy slots from RPC hook instead of direct sessions read
        const sessions = busy.map(b => ({
          session_date: b.session_date,
          status: b.status
        }));
        setBookedSessions(sessions);

        // 4. Combine and Calculate Final Available Slots
        const processedSlots = combineAndCalculateAvailability(
          templates,
          exceptions || [],
          sessions,
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
  }, [trainerId, windowStart, windowEnd, busy, combineAndCalculateAvailability, isValidTrainerId, busyError]); // Stable deps only

  const handleNext = () => {
    if (view === "week") {
      setSelectedDate(addWeeks(selectedDate, 1));
    } else {
      setCurrentDisplayMonth(addDays(currentDisplayMonth, 30));
    }
    console.log("[Nav] Next", { view, selectedDate: selectedDate.toISOString(), currentDisplayMonth: currentDisplayMonth.toISOString() });
  };

  const handlePrev = () => {
    if (view === "week") {
      setSelectedDate(subWeeks(selectedDate, 1));
    } else {
      setCurrentDisplayMonth(addDays(currentDisplayMonth, -30));
    }
    console.log("[Nav] Prev", { view, selectedDate: selectedDate.toISOString(), currentDisplayMonth: currentDisplayMonth.toISOString() });
  };

  const handleViewChange = (newView: 'week' | 'month' | 'day') => {
    if (view !== newView) {
      if (newView === 'week') {
        setSelectedDate(startOfWeek(selectedDate || currentDisplayMonth, { weekStartsOn }));
      }
      if (newView === 'month') {
        setCurrentDisplayMonth(startOfMonth(selectedDate || currentDisplayMonth));
      }
      setView(newView);
    }
  };

  // Handler to switch to a specific day view
  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setView('day');
  };

  // Handler for clicking the "Book" button
  const handleBookClick = (slot: AvailableSlot) => {
    setSelectedSlotForModal(slot);
    setIsModalOpen(true);
  };

  const handlePrevWeek = useCallback(() => {
    setSelectedDate(prevDate => subWeeks(prevDate, 1));
    // Scroll to top after week change
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setSelectedDate(prevDate => addWeeks(prevDate, 1));
    // Scroll to top after week change
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const handleTodayJump = useCallback(() => {
    const today = new Date();
    setSelectedDate(today);
    setCurrentDisplayMonth(today);
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  // Performance optimization: canonical week days from selectedDate - SINGLE SOURCE OF TRUTH
  const weekDays = useMemo(() => {
    if (view !== 'week') return [];
    const start = windowStart; // already memoized from selectedDate
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    console.log("[WeekNav]", {
      view,
      selectedDate: selectedDate.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString()
    });
    return days;
  }, [view, windowStart, selectedDate]);
  
  const slotsByDay = useMemo(() => {
    const byDay: Record<string, {count: number; slots: {start: Date; end: Date}[]}> = {};
    weekDays.forEach(d => { 
      byDay[d.toDateString()] = { count: 0, slots: [] }; 
    });
    for (const s of (availableSlots ?? [])) {
      const d = new Date(s.start);
      const key = d.toDateString();
      if (byDay[key]) { 
        byDay[key].count++; 
        byDay[key].slots.push(s); 
      }
    }
    return byDay;
  }, [availableSlots, weekDays]);

  // Swipe gesture setup
  const swipeRef = useSwipeGesture({
    onSwipeLeft: handleNextWeek,
    onSwipeRight: handlePrevWeek,
    enabled: isMobile && !isLoadingAvailability,
    threshold: 60,
    maxVerticalMovement: 40
  });

  // Mobile Week Header Component
  const MobileWeekHeader = () => {
    const label = weekDays.length > 0 
      ? `${format(weekDays[0], "MMM dd")} – ${format(weekDays[6], "MMM dd, yyyy")}`
      : '';

    return (
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
        <div className="px-4 py-2">
          {/* Week range label ABOVE the buttons */}
          <div className="text-center text-sm font-medium mb-2">{label}</div>

          {/* Buttons row */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevWeek}
              className="text-sm"
              aria-label="Previous week"
            >
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextWeek}
              className="text-sm"
              aria-label="Next week"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Day Tile Component
  type DayTileProps = {
    date: Date;
    isAvailable: boolean;
    isToday: boolean;
    selected?: boolean;
    onSelect: (date: Date) => void;
  };

  const DayTile = ({ date, isAvailable, isToday, selected, onSelect }: DayTileProps) => {
    const dayName = format(date, "EEEE");
    const dayLabel = format(date, "MMM d");

    const handleTileClick = () => {
      // Haptic feedback
      if (ENABLE_VIBRATION && navigator.vibrate) {
        navigator.vibrate(10);
      }
      setLastSelectedDate(date);
      onSelect(date);
    };

    if (!isAvailable) {
      return (
        <div
          className="opacity-60 pointer-events-none rounded-xl border bg-muted px-4 py-3"
          aria-disabled="true"
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              {isToday && (
                <span className="mb-1 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide w-fit bg-primary/10 text-primary">
                  Today
                </span>
              )}
              <span className="text-base font-semibold text-muted-foreground">{dayName}</span>
              <span className="text-xs text-muted-foreground">{dayLabel}</span>
            </div>
            <span className="text-sm text-muted-foreground">No availability</span>
          </div>
        </div>
      );
    }

    return (
      <Button
        onClick={handleTileClick}
        variant="outline"
        className={`h-auto w-full justify-between rounded-xl px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground 
          transition-all duration-150 ease-out active:scale-[0.98] 
          ${selected ? 'ring-1 ring-primary/60 shadow-sm' : ''}
          motion-reduce:transition-none motion-reduce:active:scale-100`}
        aria-pressed={false}
      >
        <div className="flex flex-col">
          {isToday && (
            <span className="mb-1 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide w-fit bg-primary/10 text-primary">
              Today
            </span>
          )}
          <span className="text-base font-semibold">{dayName}</span>
          <span className="text-xs text-muted-foreground">{dayLabel}</span>
        </div>
        <span className="text-sm font-medium text-primary">Available</span>
      </Button>
    );
  };

  const renderMobileWeekView = () => {
    const label = weekDays.length > 0 
      ? `${format(weekDays[0], "MMM dd")} – ${format(weekDays[6], "MMM dd, yyyy")}`
      : '';

    const handleSelectDay = (date: Date) => {
      setSelectedDate(date);
      setView("day");
    };

    const scheduleListDays = weekDays.map((date) => {
      const slotsForDay = getSlotsForDate(date, availableSlots);
      const isAvailable = slotsForDay.length > 0;
      
      return {
        date,
        dayLabel: format(date, "EEEE"),
        subLabel: format(date, "MMM d"),
        status: isAvailable ? 'available' as const : 'none' as const,
        onClick: () => handleSelectDay(date),
      };
    });

    return (
      <div ref={swipeRef}>
        <ScheduleListView
          days={scheduleListDays}
          activeView={view as 'week' | 'month'}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          onToggleView={(newView) => setView(newView)}
          rangeLabel={label}
        />
      </div>

    );
  };

  const renderWeekView = () => {
    if (isMobile) {
      return renderMobileWeekView();
    }

    // Desktop week view - use canonical weekDays from selectedDate
    const label = weekDays.length > 0 
      ? `${format(weekDays[0], 'MMM dd')} - ${format(weekDays[6], 'MMM dd, yyyy')}`
      : '';

    return (
      <div className="space-y-4">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevWeek}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <h3 className="text-lg font-semibold">
            {label}
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            className="flex items-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Week Grid - keyed to force re-render per week change */}
        <div key={`week-${windowStart.toISOString()}`} className="grid grid-cols-7 gap-2 h-96">
          {weekDays.map(day => (
            <div key={day.toISOString()} className="border rounded-lg p-2 bg-card">
              <div className={`text-sm font-medium mb-2 ${isToday(day) ? 'text-primary' : 'text-muted-foreground'}`}>
                {format(day, 'E d')}
              </div>
              <div className="space-y-1">
                {availableSlots
                  .filter(slot => isSameDay(slot.start, day))
                  .map((slot, index) => (
                    <Button
                      key={`${day.toISOString()}-${index}`}
                      size="sm"
                      variant="outline"
                      className="w-full text-xs h-8"
                      onClick={() => handleDayClick(day)}
                    >
                      {format(slot.start, 'h:mm a')}
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const daySlots = availableSlots.filter(slot => isSameDay(slot.start, selectedDate));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => setView('week')}
            className="text-sm"
          >
            ← Back to Week
          </Button>
          <h3 className="text-lg font-semibold">{format(selectedDate, 'EEEE, MMM dd, yyyy')}</h3>
          <div></div>
        </div>
        <div className="grid gap-2 max-w-md mx-auto">
          {daySlots.length > 0 ? (
            daySlots.map((slot, index) => (
              <Button
                key={`${selectedDate.toISOString()}-${index}`}
                className="w-full justify-between h-12"
                onClick={() => handleBookClick(slot)}
              >
                <span>{format(slot.start, 'h:mm a')} - {format(slot.end, 'h:mm a')}</span>
                <span className="text-sm">Book</span>
              </Button>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No available slots for this day.
            </p>
          )}
        </div>
      </div>
    );
  };

  // Transform available slots into calendar events
  const calendarEvents = availableSlots.map((slot, index) => ({
    id: index,
    title: 'Available',
    start: slot.start,
    end: slot.end,
    resource: slot
  }));

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
        <CardContent className="p-4 flex flex-col gap-3">
          <p className="text-destructive">Error: {error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refetchBusy}
            className="w-fit"
          >
            Try Again
          </Button>
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
        {/* View toggles */}
        <div className="flex justify-center gap-2 mb-4">
          <Button 
            onClick={() => handleViewChange('week')} 
            variant={view === 'week' ? 'default' : 'outline'}
            size="sm"
          >
            Week
          </Button>
          <Button 
            onClick={() => handleViewChange('month')} 
            variant={view === 'month' ? 'default' : 'outline'}
            size="sm"
          >
            Month
          </Button>
          {view === 'day' && (
            <Button 
              onClick={() => handleViewChange('day')} 
              variant="default"
              size="sm"
            >
              Day
            </Button>
          )}
        </div>

        {/* Calendar display area */}
        {isLoadingAvailability ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : (
          <div className="mt-4">
            {view === 'month' && (
              <div style={{ height: '600px' }}>
                <Calendar
                  localizer={localizer}
                  events={calendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  defaultDate={currentDisplayMonth}
                  date={currentDisplayMonth}
                  view="month"
                  onNavigate={setCurrentDisplayMonth}
                  step={30}
                  timeslots={2}
                  views={['month']}
                  eventPropGetter={() => ({
                    style: {
                      backgroundColor: 'hsl(var(--primary))',
                      borderRadius: '4px',
                      opacity: 0.8,
                      color: 'white',
                      border: '0px',
                      display: 'block'
                    }
                  })}
                  onSelectEvent={(event) => {
                    const slotDate = event.resource.start;
                    handleDayClick(slotDate);
                  }}
                />
              </div>
            )}
            {view === 'week' && renderWeekView()}
            {view === 'day' && renderDayView()}
          </div>
        )}
      </CardContent>
      <UniversalSessionModal
        mode="book"
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedSlot={selectedSlotForModal}
        clientId={clientId}
        trainerId={trainerId}
      />
    </Card>
  );
}