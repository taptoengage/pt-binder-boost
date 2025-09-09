import React, { useState, useMemo } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, isWithinInterval, isToday, eachDayOfInterval, isSameMonth, isSameDay, parse, setMinutes, setHours, addMinutes, isBefore } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarOff, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import UniversalSessionModal from '@/components/UniversalSessionModal';
import BlockAvailabilityModal from '@/components/BlockAvailabilityModal';
import { useToast } from '@/hooks/use-toast';

// Helper to generate 30-minute time slots for a day
const generateDayTimeSlots = () => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push(format(setMinutes(setHours(new Date(), h), m), 'HH:mm'));
    }
  }
  return slots;
};
const allDayTimeSlots = generateDayTimeSlots();

// Helper function to get effective availability for a specific day
const getEffectiveDayAvailabilityRanges = (
  day: Date,
  recurringTemplates: any[],
  exceptions: any[]
) => {
  const dayKey = format(day, 'yyyy-MM-dd');
  const dayOfWeekLowercase = format(day, 'EEEE').toLowerCase();

  // 1. Get Recurring Ranges for this day
  let currentDayRanges: Array<{ start: Date; end: Date }> = (recurringTemplates || [])
    .filter(template => template.day_of_week === dayOfWeekLowercase)
    .map(block => ({
      start: parse(block.start_time, 'HH:mm', day),
      end: parse(block.end_time, 'HH:mm', day),
    }));

  // Sort and merge recurring ranges for this day
  currentDayRanges.sort((a, b) => a.start.getTime() - b.start.getTime());
  let mergedRecurringRanges: Array<{ start: Date; end: Date }> = [];
  if (currentDayRanges.length > 0) {
    let lastMerged = currentDayRanges[0];
    for (let i = 1; i < currentDayRanges.length; i++) {
      if (currentDayRanges[i].start.getTime() <= lastMerged.end.getTime()) {
        lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), currentDayRanges[i].end.getTime()));
      } else {
        mergedRecurringRanges.push(lastMerged);
        lastMerged = currentDayRanges[i];
      }
    }
    mergedRecurringRanges.push(lastMerged);
  }
  // Start with merged recurring ranges as base for this day
  let effectiveAvailableRanges = mergedRecurringRanges;

  // 2. Apply Exceptions for this specific date
  const exceptionsForThisDay = (exceptions || []).filter(
    ex => format(new Date(ex.exception_date), 'yyyy-MM-dd') === dayKey
  );

  exceptionsForThisDay.forEach(exception => {
    const exceptionDateRef = new Date(exception.exception_date);

    if (exception.exception_type === 'unavailable_full_day') {
      effectiveAvailableRanges = [];
    } else if (exception.exception_type === 'unavailable_partial_day') {
      const unavailableStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
      const unavailableEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

      const newRangesAfterPartialRemoval: Array<{ start: Date; end: Date }> = [];
      effectiveAvailableRanges.forEach(range => {
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
      effectiveAvailableRanges = newRangesAfterPartialRemoval;

    } else if (exception.exception_type === 'available_extra_slot') {
      const extraStart = parse(exception.start_time || '00:00', 'HH:mm', exceptionDateRef);
      const extraEnd = parse(exception.end_time || '23:59', 'HH:mm', exceptionDateRef);

      effectiveAvailableRanges.push({ start: extraStart, end: extraEnd });

      // Re-merge after adding extra slot
      effectiveAvailableRanges.sort((a, b) => a.start.getTime() - b.start.getTime());
      const tempMerged: Array<{ start: Date; end: Date }> = [];
      if (effectiveAvailableRanges.length > 0) {
        let lastTempMerged = effectiveAvailableRanges[0];
        for (let i = 1; i < effectiveAvailableRanges.length; i++) {
          if (effectiveAvailableRanges[i].start.getTime() <= lastTempMerged.end.getTime()) {
            lastTempMerged.end = new Date(Math.max(lastTempMerged.end.getTime(), effectiveAvailableRanges[i].end.getTime()));
          } else {
            tempMerged.push(lastTempMerged);
            lastTempMerged = effectiveAvailableRanges[i];
          }
        }
        tempMerged.push(lastTempMerged);
      }
      effectiveAvailableRanges = tempMerged;
    }
  });

  return effectiveAvailableRanges;
};

// NEW: Helper function to get time slots that should be displayed (including session-occupied slots)
const getSlotsToDisplayForDay = (
  day: Date,
  effectiveAvailableRanges: Array<{ start: Date; end: Date }>,
  sessionsForDay: any[],
  isFullDayUnavailable: boolean
) => {
  if (isFullDayUnavailable) {
    // For full day unavailable, still show sessions if any exist
    const sessionSlots = new Set<string>();
    sessionsForDay.forEach(session => {
      const sessionStart = new Date(session.session_date);
      const sessionTime = format(sessionStart, 'HH:mm');
      
      // Add the exact session time and a few slots around it for visibility
      const sessionMinutes = sessionStart.getHours() * 60 + sessionStart.getMinutes();
      const roundedDown = Math.floor(sessionMinutes / 30) * 30;
      
      for (let i = 0; i < 2; i++) { // Show 1 hour (2 slots of 30min each)
        const slotMinutes = roundedDown + (i * 30);
        if (slotMinutes < 24 * 60) { // Don't go past midnight
          const slotHours = Math.floor(slotMinutes / 60);
          const slotMins = slotMinutes % 60;
          const slotTime = `${slotHours.toString().padStart(2, '0')}:${slotMins.toString().padStart(2, '0')}`;
          sessionSlots.add(slotTime);
        }
      }
    });
    
    return Array.from(sessionSlots).sort();
  }

  // Generate slots from availability ranges
  const availabilitySlots = effectiveAvailableRanges.flatMap(range => {
    const rangeSlots = [];
    let currentSlotTime = range.start;
    while (isBefore(currentSlotTime, range.end)) {
      rangeSlots.push(format(currentSlotTime, 'HH:mm'));
      currentSlotTime = addMinutes(currentSlotTime, 30);
    }
    return rangeSlots;
  });

  // Add slots for sessions that fall outside availability
  const sessionSlots = new Set<string>();
  sessionsForDay.forEach(session => {
    const sessionStart = new Date(session.session_date);
    const sessionTime = format(sessionStart, 'HH:mm');
    
    // Check if this session falls within any availability range
    const sessionFallsWithinAvailability = effectiveAvailableRanges.some(range => {
      const sessionEnd = addMinutes(sessionStart, 60); // Assuming 1-hour sessions
      return sessionStart >= range.start && sessionEnd <= range.end;
    });

    // If session is outside availability, add slots to display it
    if (!sessionFallsWithinAvailability) {
      const sessionMinutes = sessionStart.getHours() * 60 + sessionStart.getMinutes();
      const roundedDown = Math.floor(sessionMinutes / 30) * 30;
      
      // Add slots to cover the full session duration
      for (let i = 0; i < 2; i++) { // Show 1 hour (2 slots of 30min each)
        const slotMinutes = roundedDown + (i * 30);
        if (slotMinutes < 24 * 60) {
          const slotHours = Math.floor(slotMinutes / 60);
          const slotMins = slotMinutes % 60;
          const slotTime = `${slotHours.toString().padStart(2, '0')}:${slotMins.toString().padStart(2, '0')}`;
          sessionSlots.add(slotTime);
        }
      }
    }
  });

  // Combine and deduplicate slots
  const allSlots = new Set([...availabilitySlots, ...sessionSlots]);
  return Array.from(allSlots).sort();
};

// NEW: Helper function to determine if a slot is outside normal availability
const isSlotOutsideAvailability = (
  slotTime: string,
  day: Date,
  effectiveAvailableRanges: Array<{ start: Date; end: Date }>
) => {
  const slotStart = parse(slotTime, 'HH:mm', day);
  const slotEnd = addMinutes(slotStart, 30);
  
  return !effectiveAvailableRanges.some(range =>
    slotStart >= range.start && slotEnd <= range.end
  );
};

export default function ViewSchedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentView, setCurrentView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSessionDetailModalOpen, setIsSessionDetailModalOpen] = useState(false);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<any | null>(null);
  const [isBlockAvailabilityModalOpen, setIsBlockAvailabilityModalOpen] = useState(false);

  // Fetch all trainer's sessions
  const { data: allTrainerSessions, isLoading: isLoadingSessions, error: sessionsError } = useQuery({
    queryKey: ['trainerSessions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          status,
          notes,
          subscription_id,
          is_from_credit,
          clients (id, name),
          service_types (id, name)
        `)
        .eq('trainer_id', user.id)
        .in('status', ['scheduled', 'completed'])
        .order('session_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch trainer's recurring availability templates
  const { data: recurringTemplates, isLoading: isLoadingTemplates, error: templatesError } = useQuery({
    queryKey: ['trainerAvailabilityTemplates', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('trainer_availability_templates')
        .select('*')
        .eq('trainer_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error("Error fetching recurring templates:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  // Fetch trainer's one-off availability exceptions
  const { data: exceptions, isLoading: isLoadingExceptions, error: exceptionsError } = useQuery({
    queryKey: ['trainerAvailabilityExceptions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('trainer_availability_exceptions')
        .select('*')
        .eq('trainer_id', user.id)
        .order('exception_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error("Error fetching exceptions:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  // Calculate period start and end dates based on currentView and selectedDate
  const { periodStart, periodEnd, formattedPeriod } = useMemo(() => {
    let start: Date;
    let end: Date;
    let formatted: string;

    if (currentView === 'day') {
      start = startOfDay(selectedDate);
      end = endOfDay(selectedDate);
      formatted = format(selectedDate, 'PPP');
    } else if (currentView === 'week') {
      start = startOfWeek(selectedDate, { weekStartsOn: 1 });
      end = endOfWeek(selectedDate, { weekStartsOn: 1 });
      formatted = `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
    } else {
      start = startOfMonth(selectedDate);
      end = endOfMonth(selectedDate);
      formatted = format(selectedDate, 'MMM yyyy');
    }
    return { periodStart: start, periodEnd: end, formattedPeriod: formatted };
  }, [currentView, selectedDate]);

  // Filter sessions within the current period
  const filteredSessions = useMemo(() => {
    if (!allTrainerSessions) return [];
    return allTrainerSessions.filter((session: any) => {
      const sessionDateTime = new Date(session.session_date);
      return isWithinInterval(sessionDateTime, { start: periodStart, end: periodEnd });
    });
  }, [allTrainerSessions, periodStart, periodEnd]);

  // Group filtered sessions by day for week/month views
  const groupedSessionsByDay = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredSessions.forEach((session: any) => {
      const dateKey = format(new Date(session.session_date), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(session);
    });
    // Sort sessions within each day by time
    Object.keys(groups).forEach(dateKey => {
      groups[dateKey].sort((a, b) => {
        const timeA = new Date(a.session_date).getTime();
        const timeB = new Date(b.session_date).getTime();
        return timeA - timeB;
      });
    });
    return groups;
  }, [filteredSessions]);

  // Navigation handlers
  const handlePreviousPeriod = () => {
    if (currentView === 'day') {
      setSelectedDate(subDays(selectedDate, 1));
    } else if (currentView === 'week') {
      setSelectedDate(subWeeks(selectedDate, 1));
    } else {
      setSelectedDate(subMonths(selectedDate, 1));
    }
  };

  const handleNextPeriod = () => {
    if (currentView === 'day') {
      setSelectedDate(addDays(selectedDate, 1));
    } else if (currentView === 'week') {
      setSelectedDate(addWeeks(selectedDate, 1));
    } else {
      setSelectedDate(addMonths(selectedDate, 1));
    }
  };

  if (isLoadingSessions || isLoadingTemplates || isLoadingExceptions) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">My Schedule</h1>
          <p>Loading schedule and availability...</p>
        </main>
      </div>
    );
  }

  if (sessionsError || templatesError || exceptionsError) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">My Schedule</h1>
          <p className="text-red-500">Error loading schedule: {sessionsError?.message || templatesError?.message || exceptionsError?.message}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-heading-1 mb-6">My Schedule</h1>

        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          {/* Period Navigation */}
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" onClick={handlePreviousPeriod}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-semibold text-gray-800">{formattedPeriod}</h2>
            <Button variant="outline" size="icon" onClick={handleNextPeriod}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Block Availability and View Toggles */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setIsBlockAvailabilityModalOpen(true)}
              className="flex items-center gap-2"
            >
              <CalendarOff className="h-4 w-4" />
              Block Availability
            </Button>
            
            <ToggleGroup type="single" value={currentView} onValueChange={(value: 'day' | 'week' | 'month') => {
              if (value) setCurrentView(value);
            }}>
              <ToggleGroupItem value="day" aria-label="Toggle day view">
                Day
              </ToggleGroupItem>
              <ToggleGroupItem value="week" aria-label="Toggle week view">
                Week
              </ToggleGroupItem>
              <ToggleGroupItem value="month" aria-label="Toggle month view">
                Month
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="calendar-grid-display border rounded-lg p-4 bg-white shadow-sm">
          {/* Conditional rendering based on currentView */}
          {currentView === 'day' && (
            <div className="space-y-px">
              {(() => {
                const effectiveAvailableRangesForDay = getEffectiveDayAvailabilityRanges(
                  selectedDate,
                  recurringTemplates || [],
                  exceptions || []
                );

                const isFullDayUnavailable = (exceptions || []).some(ex =>
                    format(new Date(ex.exception_date), 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') &&
                    ex.exception_type === 'unavailable_full_day'
                );

                const slotsToDisplay = getSlotsToDisplayForDay(
                  selectedDate,
                  effectiveAvailableRangesForDay,
                  filteredSessions,
                  isFullDayUnavailable
                );

                if (slotsToDisplay.length === 0) {
                    return (
                        <div className="text-center py-12 text-gray-500">
                            No availability or sessions for this day.
                        </div>
                    );
                }

                return (
                    <>
                        {slotsToDisplay.map(slotTime => {
                            const sessionsInSlot = filteredSessions.filter((session: any) => {
                                const sessionStart = new Date(session.session_date);
                                const sessionEnd = addMinutes(sessionStart, 60);
                                const slotStart = parse(slotTime, 'HH:mm', selectedDate);
                                const slotEnd = addMinutes(slotStart, 30);
                                return (sessionStart >= slotStart && sessionStart < slotEnd) ||
                                       (slotStart >= sessionStart && slotStart < sessionEnd);
                            });

                            const isOutsideAvailability = isSlotOutsideAvailability(
                              slotTime, 
                              selectedDate, 
                              effectiveAvailableRangesForDay
                            );

                            return (
                                <div
                                    key={slotTime}
                                    className={cn(
                                        "relative h-12 border-b border-gray-200",
                                        {
                                          'bg-blue-50': !isOutsideAvailability,
                                          'bg-orange-50 border-orange-200': isOutsideAvailability
                                        }
                                    )}
                                >
                                    <span className={cn(
                                      "absolute left-2 top-1 text-xs flex items-center gap-1",
                                      {
                                        'text-gray-500': !isOutsideAvailability,
                                        'text-orange-600': isOutsideAvailability
                                      }
                                    )}>
                                      {slotTime}
                                      {isOutsideAvailability && <Clock className="h-3 w-3" />}
                                    </span>
                                    {sessionsInSlot.map((session: any) => (
                                        <Card
                                            key={session.id}
                                            className={cn(
                                              "absolute left-16 right-0 top-0 bottom-0 p-1 cursor-pointer transition-colors flex items-center",
                                              {
                                                'hover:bg-blue-200': !isOutsideAvailability,
                                                'bg-orange-100 hover:bg-orange-200 border-orange-300': isOutsideAvailability
                                              }
                                            )}
                                            onClick={() => {
                                                setSelectedSessionForModal(session);
                                                setIsSessionDetailModalOpen(true);
                                            }}
                                        >
                                            <div className="flex-1 text-xs font-medium truncate">
                                                {session.clients?.name} - {format(new Date(session.session_date), 'p')}
                                            </div>
                                            <Badge className={cn(
                                              "ml-auto h-4 px-1 text-xs",
                                              { 'bg-green-500': session.status === 'scheduled' },
                                              { 'bg-gray-500': session.status === 'completed' },
                                              { 'bg-red-500': session.status === 'cancelled' || session.status === 'cancelled_late' },
                                              { 'bg-orange-500': session.status === 'cancelled_early' }
                                            )}>
                                              {session.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </Badge>
                                        </Card>
                                    ))}
                                </div>
                            );
                        })}
                    </>
                );
              })()}
            </div>
          )}

          {currentView === 'week' && (
            <div className="grid grid-cols-7 gap-px border bg-gray-200 rounded-lg overflow-hidden min-h-[400px]">
              {/* Day headers */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                <div key={dayName} className="bg-gray-100 p-2 text-center text-xs font-medium border-b border-r last:border-r-0">
                  {dayName}
                </div>
              ))}

              {/* Week days with sessions that may be outside availability */}
              {eachDayOfInterval({ start: periodStart, end: periodEnd }).map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const sessionsForDay = groupedSessionsByDay[dateKey] || [];
                const isCurrentDay = isSameDay(day, new Date());
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                const effectiveAvailableRangesForDay = getEffectiveDayAvailabilityRanges(
                  day,
                  recurringTemplates || [],
                  exceptions || []
                );

                const isFullDayUnavailable = (exceptions || []).some(ex =>
                  format(new Date(ex.exception_date), 'yyyy-MM-dd') === dateKey &&
                  ex.exception_type === 'unavailable_full_day'
                );

                const slotsToDisplay = getSlotsToDisplayForDay(
                  day,
                  effectiveAvailableRangesForDay,
                  sessionsForDay,
                  isFullDayUnavailable
                );

                return (
                  <div key={dateKey} className={cn(
                    "bg-white border-b border-r last:border-r-0 sm:border-r-0 sm:border-b-0",
                    { 'bg-red-100 border-red-200': isFullDayUnavailable },
                    { 'text-gray-400 bg-gray-50': isWeekend && !isCurrentDay && !isFullDayUnavailable },
                    { 'bg-blue-50 border-blue-200': isCurrentDay }
                  )}>
                    <h3 className="text-sm font-semibold text-center py-2">
                      {format(day, 'EEE dd')}
                    </h3>
                    <div className="space-y-px h-[calc(100%-30px)] overflow-y-auto">
                      {slotsToDisplay.length > 0 ? (
                        slotsToDisplay.map(slotTime => {
                          const sessionsInSlot = sessionsForDay.filter((session: any) => {
                            const sessionStart = new Date(session.session_date);
                            const sessionEnd = addMinutes(sessionStart, 60);
                            const slotStart = parse(slotTime, 'HH:mm', day);
                            const slotEnd = addMinutes(slotStart, 30);
                            return (sessionStart >= slotStart && sessionStart < slotEnd) ||
                                   (slotStart >= sessionStart && slotStart < sessionEnd);
                          });

                          const isOutsideAvailability = isSlotOutsideAvailability(
                            slotTime, 
                            day, 
                            effectiveAvailableRangesForDay
                          );

                          return (
                            <div
                              key={slotTime}
                              className={cn(
                                "relative h-8 border-b border-gray-100 last:border-b-0",
                                {
                                  'bg-blue-50': !isWeekend && !isOutsideAvailability,
                                  'bg-blue-100': isWeekend && !isOutsideAvailability,
                                  'bg-orange-50': isOutsideAvailability && !isWeekend,
                                  'bg-orange-100': isOutsideAvailability && isWeekend
                                }
                              )}
                            >
                              <span className={cn(
                                "absolute left-1 top-0 text-[8px] flex items-center gap-0.5",
                                {
                                  'text-gray-400': !isOutsideAvailability,
                                  'text-orange-600': isOutsideAvailability
                                }
                              )}>
                                {slotTime}
                                {isOutsideAvailability && <Clock className="h-2 w-2" />}
                              </span>
                              {sessionsInSlot.map((session: any) => (
                                <div
                                  key={session.id}
                                  className={cn(
                                    "absolute left-8 right-0 top-0 bottom-0 p-0.5 rounded-sm cursor-pointer flex items-center justify-between",
                                    {
                                      'bg-blue-200 hover:bg-blue-300': !isOutsideAvailability,
                                      'bg-orange-200 hover:bg-orange-300 border border-orange-400': isOutsideAvailability
                                    }
                                  )}
                                  onClick={() => {
                                    setSelectedSessionForModal(session);
                                    setIsSessionDetailModalOpen(true);
                                  }}
                                >
                                  <span className="text-[10px] font-medium truncate">{session.clients?.name}</span>
                                  <Badge className={cn(
                                    "ml-auto h-3 px-1 text-[8px]",
                                    { 'bg-green-500': session.status === 'scheduled' },
                                    { 'bg-gray-500': session.status === 'completed' },
                                    { 'bg-red-500': session.status.startsWith('cancelled') }
                                  )}>
                                    {session.status.replace(/_/g, ' ').charAt(0).toUpperCase()}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-2 text-gray-400 text-xs">
                          {isFullDayUnavailable ? 'Unavailable' : 'No availability set'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentView === 'month' && (
            <div className="grid grid-cols-7 gap-px border bg-gray-200 rounded-lg overflow-hidden min-h-[500px]">
              {/* Day headers */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                <div key={dayName} className="bg-gray-100 p-2 text-center text-xs font-medium border-b border-r last:border-r-0">
                  {dayName}
                </div>
              ))}

              {/* Days of the month */}
              {eachDayOfInterval({ start: startOfWeek(periodStart, { weekStartsOn: 1 }), end: endOfWeek(periodEnd, { weekStartsOn: 1 }) }).map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const sessionsForDayCount = groupedSessionsByDay[dateKey]?.length || 0;
                const isCurrentMonth = isSameMonth(day, selectedDate);
                const isCurrentDay = isSameDay(day, new Date());
                
                // Check if any sessions are outside availability for visual indication
                const sessionsForDay = groupedSessionsByDay[dateKey] || [];
                const effectiveAvailableRanges = getEffectiveDayAvailabilityRanges(
                  day,
                  recurringTemplates || [],
                  exceptions || []
                );
                
                const hasSessionsOutsideAvailability = sessionsForDay.some(session => {
                  const sessionStart = new Date(session.session_date);
                  const sessionEnd = addMinutes(sessionStart, 60);
                  return !effectiveAvailableRanges.some(range =>
                    sessionStart >= range.start && sessionEnd <= range.end
                  );
                });

                return (
                  <div
                    key={dateKey}
                    className={cn(
                      "bg-white p-2 border-b border-r last:border-r-0 cursor-pointer hover:bg-gray-100 transition-colors",
                      { 'text-gray-400 bg-gray-50': !isCurrentMonth },
                      { 'bg-blue-50 border-blue-200': isCurrentDay },
                      { 'ring-1 ring-orange-300': hasSessionsOutsideAvailability && isCurrentMonth }
                    )}
                    onClick={() => {
                      setSelectedDate(day);
                      setCurrentView('day');
                    }}
                  >
                    <div className="flex justify-between items-center text-xs font-semibold mb-1">
                      <span>{format(day, 'd')}</span>
                      <div className="flex items-center gap-1">
                        {sessionsForDayCount > 0 && (
                          <Badge 
                            variant="default" 
                            className={cn(
                              "h-4 px-1 rounded-full text-xs",
                              { 'bg-orange-500': hasSessionsOutsideAvailability }
                            )}
                          >
                            {sessionsForDayCount}
                          </Badge>
                        )}
                        {hasSessionsOutsideAvailability && (
                          <Clock className="h-3 w-3 text-orange-500" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredSessions.length === 0 && currentView !== 'month' && (
            <div className="text-center py-12 text-gray-500">
              No sessions scheduled for this {currentView} view.
            </div>
          )}
        </div>

        {/* Legend for outside-availability sessions */}
        {currentView !== 'month' && filteredSessions.some(session => {
          const sessionDay = new Date(session.session_date);
          const dayInPeriod = isWithinInterval(sessionDay, { start: periodStart, end: periodEnd });
          if (!dayInPeriod) return false;
          
          const effectiveRanges = getEffectiveDayAvailabilityRanges(
            sessionDay,
            recurringTemplates || [],
            exceptions || []
          );
          
          const sessionStart = new Date(session.session_date);
          const sessionEnd = addMinutes(sessionStart, 60);
          return !effectiveRanges.some(range =>
            sessionStart >= range.start && sessionEnd <= range.end
          );
        }) && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-orange-700">
              <Clock className="h-4 w-4" />
              <span className="font-medium">Sessions outside standard availability</span>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Orange highlighted sessions were scheduled outside your regular availability hours.
            </p>
          </div>
        )}

        {/* Render the session detail modal */}
        <UniversalSessionModal
          mode="view"
          isOpen={isSessionDetailModalOpen}
          onClose={() => {
            setIsSessionDetailModalOpen(false);
            setSelectedSessionForModal(null);
          }}
          session={selectedSessionForModal}
          onSessionUpdated={() => {
            // Refresh the sessions data when a session is updated
            queryClient.invalidateQueries({ queryKey: ['trainerSessions', user?.id] });
          }}
        />

        {/* Render the block availability modal */}
        <BlockAvailabilityModal
          isOpen={isBlockAvailabilityModalOpen}
          onClose={() => setIsBlockAvailabilityModalOpen(false)}
          trainerId={user?.id || ''}
        />
      </main>
    </div>
  );
}