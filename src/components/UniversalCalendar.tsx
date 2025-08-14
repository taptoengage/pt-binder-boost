import React from 'react';
import { format, isSameDay, isToday, startOfWeek, addDays, eachDayOfInterval } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as UICalendar } from '@/components/ui/calendar';
import { Loader2 } from 'lucide-react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useUniversalCalendar } from '@/hooks/useUniversalCalendar';
import { cn } from '@/lib/utils';

const localizer = momentLocalizer(moment);

export interface UniversalCalendarProps {
  mode: 'date-picker' | 'trainer-schedule' | 'client-booking';
  trainerId?: string;
  onSlotSelect?: (slot: { start: Date; end: Date }) => void;
  onDateChange?: (date: Date) => void;
  selectedDate?: Date;
  className?: string;
  // Additional props for customization
  showHeader?: boolean;
  title?: string;
  description?: string;
}

export default function UniversalCalendar({
  mode,
  trainerId,
  onSlotSelect,
  onDateChange,
  selectedDate,
  className,
  showHeader = true,
  title,
  description
}: UniversalCalendarProps) {
  const {
    currentDisplayMonth,
    selectedDate: internalSelectedDate,
    view,
    availableSlots,
    isLoading,
    error,
    handleNextMonth,
    handlePrevMonth,
    handleViewChange,
    handleDayClick,
  } = useUniversalCalendar({
    trainerId,
    enabled: mode !== 'date-picker',
    initialDate: selectedDate
  });

  // Use controlled selectedDate if provided, otherwise use internal state
  const currentSelectedDate = selectedDate || internalSelectedDate;

  // Handler for date picker mode
  const handleDatePickerChange = (date: Date | undefined) => {
    if (date && onDateChange) {
      onDateChange(date);
    }
  };

  // Handler for slot selection (booking mode)
  const handleSlotClick = (slot: { start: Date; end: Date }) => {
    if (onSlotSelect) {
      onSlotSelect(slot);
    }
  };

  // Render simple date picker
  if (mode === 'date-picker') {
    return (
      <UICalendar
        mode="single"
        selected={currentSelectedDate}
        onSelect={handleDatePickerChange}
        className={cn("rounded-md border", className)}
      />
    );
  }

  // Loading state for complex modes
  if (isLoading) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{title || 'Calendar'}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="p-4 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading calendar...
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        {showHeader && (
          <CardHeader>
            <CardTitle>{title || 'Calendar'}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent className="p-4 text-destructive">
          Error: {error}
        </CardContent>
      </Card>
    );
  }

  // Render week view for client booking and trainer schedule
  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDisplayMonth);
    const daysOfWeek = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

    return (
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
                    onClick={() => mode === 'client-booking' ? handleSlotClick(slot) : handleDayClick(day)}
                  >
                    {format(slot.start, 'h:mm a')}
                  </Button>
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render day view for detailed slot selection
  const renderDayView = () => {
    const daySlots = availableSlots.filter(slot => isSameDay(slot.start, currentSelectedDate));

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
          <h3 className="text-lg font-semibold">{format(currentSelectedDate, 'EEEE, MMM dd, yyyy')}</h3>
          <div></div>
        </div>
        <div className="grid gap-2 max-w-md mx-auto">
          {daySlots.length > 0 ? (
            daySlots.map((slot, index) => (
              <Button
                key={`${currentSelectedDate.toISOString()}-${index}`}
                className="w-full justify-between h-12"
                onClick={() => handleSlotClick(slot)}
                disabled={mode !== 'client-booking'}
              >
                <span>{format(slot.start, 'h:mm a')} - {format(slot.end, 'h:mm a')}</span>
                {mode === 'client-booking' && <span className="text-sm">Book</span>}
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

  // Transform available slots into calendar events for month view
  const calendarEvents = availableSlots.map((slot, index) => ({
    id: index,
    title: mode === 'client-booking' ? 'Available' : 'Open',
    start: slot.start,
    end: slot.end,
    resource: slot
  }));

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <CardTitle>{title || (mode === 'client-booking' ? 'Book a Session' : 'Schedule')}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
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
                  // Handle month navigation
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
      </CardContent>
    </Card>
  );
}