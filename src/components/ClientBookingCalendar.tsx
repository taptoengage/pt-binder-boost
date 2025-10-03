import React, { useState, useMemo, useCallback, useRef } from 'react';
import { format, getDay, eachDayOfInterval, addDays, setHours, setMinutes, isSameDay, startOfWeek, isToday, isAfter, isBefore, addMinutes, isWithinInterval, addWeeks, subWeeks } from 'date-fns';
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
import { useUniversalCalendar } from "@/hooks/useUniversalCalendar";

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
  // Use the unified calendar hook
  const {
    currentDisplayMonth,
    selectedDate,
    view,
    availableSlots,
    isLoading: isLoadingAvailability,
    error,
    handleNextMonth,
    handlePrevMonth,
    handleViewChange,
    handleDayClick,
    sessions: bookedSessions
  } = useUniversalCalendar({
    trainerId,
    initialView: 'week',
    initialDate: new Date(),
    enabled: !!trainerId
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlotForModal, setSelectedSlotForModal] = useState<{ start: Date; end: Date } | null>(null);
  const [lastSelectedDate, setLastSelectedDate] = useState<Date | null>(null);
  const isMobile = useIsMobile();
  const tilesContainerRef = useRef<HTMLDivElement>(null);


  // Handler for clicking the "Book" button
  const handleBookClick = (slot: AvailableSlot) => {
    setSelectedSlotForModal(slot);
    setIsModalOpen(true);
  };

  const handlePrevWeek = useCallback(() => {
    handlePrevMonth();
    // Scroll to top after week change
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [handlePrevMonth]);

  const handleNextWeek = useCallback(() => {
    handleNextMonth();
    // Scroll to top after week change
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [handleNextMonth]);

  const handleTodayJump = useCallback(() => {
    handlePrevMonth(); // Reset to current month
    requestAnimationFrame(() => {
      tilesContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [handlePrevMonth]);

  // Performance optimization: memoize week days and slots by day
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDisplayMonth, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  }, [currentDisplayMonth]);
  
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
    const label = `${format(weekDays[0], "MMM dd")} – ${format(weekDays[6], "MMM dd, yyyy")}`;

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
    const label = `${format(weekDays[0], "MMM dd")} – ${format(weekDays[6], "MMM dd, yyyy")}`;

    const scheduleListDays = weekDays.map((date) => {
      const slotsForDay = getSlotsForDate(date, availableSlots);
      const isAvailable = slotsForDay.length > 0;
      
      return {
        date,
        dayLabel: format(date, "EEEE"),
        subLabel: format(date, "MMM d"),
        status: isAvailable ? 'available' as const : 'none' as const,
        onClick: () => handleDayClick(date),
      };
    });

    return (
      <div ref={swipeRef}>
        <ScheduleListView
          days={scheduleListDays}
          activeView={view as 'week' | 'month'}
          onPrev={handlePrevWeek}
          onNext={handleNextWeek}
          onToggleView={(newView) => handleViewChange(newView as 'week' | 'month' | 'day')}
          rangeLabel={label}
        />
      </div>

    );
  };

  const renderWeekView = () => {
    if (isMobile) {
      return renderMobileWeekView();
    }

    const weekStart = startOfWeek(currentDisplayMonth, { weekStartsOn: 1 }); // 1 = Monday
    const daysOfWeek = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

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
            {format(weekStart, 'MMM dd')} - {format(addDays(weekStart, 6), 'MMM dd, yyyy')}
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
        
        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-2 h-96">
          {daysOfWeek.map(day => (
            <div key={format(day, 'yyyy-MM-dd')} className="border rounded-lg p-2 bg-card">
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
            onClick={() => handleViewChange('week')}
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
                  onNavigate={(date) => {
                    // Update via hook handlers
                    if (date > currentDisplayMonth) {
                      handleNextMonth();
                    } else if (date < currentDisplayMonth) {
                      handlePrevMonth();
                    }
                  }}
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