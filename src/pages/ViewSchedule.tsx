import React, { useState, useMemo } from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, isWithinInterval, isToday, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import SessionDetailModal from '@/components/SessionDetailModal';

export default function ViewSchedule() {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSessionDetailModalOpen, setIsSessionDetailModalOpen] = useState(false);
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<any | null>(null);

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
        .order('session_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
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

  if (isLoadingSessions) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">My Schedule</h1>
          <p>Loading sessions...</p>
        </main>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <DashboardNavigation />
        <main className="container mx-auto px-4 py-8">
          <h1 className="text-heading-1 mb-6">My Schedule</h1>
          <p className="text-red-500">Error loading sessions: {sessionsError.message}</p>
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

          {/* View Toggles */}
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

        <div className="calendar-grid-display border rounded-lg p-4 bg-white shadow-sm">
          {/* Conditional rendering based on currentView */}
          {currentView === 'day' && (
            filteredSessions.length > 0 ? (
              <div className="space-y-4">
                {filteredSessions.map((session: any) => (
                  <Card
                    key={session.id}
                    className={cn(
                      "flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors",
                      { 'bg-blue-50 border-blue-200': isToday(new Date(session.session_date)) && session.status === 'scheduled' }
                    )}
                    onClick={() => {
                      setSelectedSessionForModal(session);
                      setIsSessionDetailModalOpen(true);
                    }}
                  >
                    <div>
                      <CardTitle className="text-lg">{session.clients?.name || 'Unknown Client'}</CardTitle>
                      <p className="text-sm text-gray-600">{session.service_types?.name || 'Unknown Service'}</p>
                      <p className="text-sm text-gray-600">
                        {format(new Date(session.session_date), 'PPP')} at {format(new Date(session.session_date), 'p')}
                      </p>
                    </div>
                    <Badge className={cn(
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
            ) : (
              <div className="text-center py-12 text-gray-500">
                No sessions scheduled for this day.
              </div>
            )
          )}

          {currentView === 'week' && (
            <div className="grid grid-cols-1 sm:grid-cols-7 gap-px border bg-gray-200 rounded-lg overflow-hidden min-h-[400px]">
              {eachDayOfInterval({ start: periodStart, end: periodEnd }).map(day => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const sessionsForDay = groupedSessionsByDay[dateKey] || [];
                const isCurrentDay = isSameDay(day, new Date());
                const isWeekend = day.getDay() === 0 || day.getDay() === 6; // Sunday or Saturday

                return (
                  <div key={dateKey} className={cn(
                    "bg-white p-2 border-b border-r last:border-r-0 sm:border-r-0 sm:border-b-0",
                    { 'bg-blue-50': isCurrentDay },
                    { 'bg-gray-100': isWeekend && !isCurrentDay }
                  )}>
                    <h3 className="text-sm font-semibold text-center mb-2">
                      {format(day, 'EEE dd')} {/* Mon 29 */}
                    </h3>
                    <div className="space-y-1">
                      {sessionsForDay.length > 0 ? (
                         sessionsForDay.map((session: any) => (
                           <div
                             key={session.id}
                             className="text-xs p-1 bg-blue-100 rounded-sm hover:bg-blue-200 cursor-pointer"
                             onClick={() => {
                               setSelectedSessionForModal(session);
                               setIsSessionDetailModalOpen(true);
                             }}
                           >
                             <p className="font-medium">{session.clients?.name}</p>
                             <p>{format(new Date(session.session_date), 'p')} - {session.service_types?.name}</p>
                           </div>
                         ))
                      ) : (
                        <p className="text-gray-400 text-center text-xs">No sessions</p>
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

                return (
                  <div
                    key={dateKey}
                    className={cn(
                      "bg-white p-2 border-b border-r last:border-r-0 cursor-pointer hover:bg-gray-100 transition-colors",
                      { 'text-gray-400 bg-gray-50': !isCurrentMonth }, // Mute days outside current month
                      { 'bg-blue-50 border-blue-200': isCurrentDay } // Highlight today
                    )}
                    onClick={() => {
                      setSelectedDate(day);
                      setCurrentView('day');
                    }}
                  >
                    <div className="flex justify-between items-center text-xs font-semibold mb-1">
                      <span>{format(day, 'd')}</span> {/* Day number */}
                      {sessionsForDayCount > 0 && (
                        <Badge variant="default" className="h-4 px-1 rounded-full text-xs">
                          {sessionsForDayCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filteredSessions.length === 0 && currentView !== 'month' && ( // Only show "No sessions" for day/week if filtered is empty
            <div className="text-center py-12 text-gray-500">
              No sessions scheduled for this {currentView} view.
            </div>
          )}
        </div>

        {/* Render the session detail modal */}
        <SessionDetailModal
          isOpen={isSessionDetailModalOpen}
          onClose={() => {
            setIsSessionDetailModalOpen(false);
            setSelectedSessionForModal(null);
          }}
          session={selectedSessionForModal}
        />
      </main>
    </div>
  );
}