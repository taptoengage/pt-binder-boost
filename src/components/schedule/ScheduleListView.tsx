import React from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { format } from 'date-fns';
import { useIsMobile } from "@/hooks/use-mobile";

interface ScheduleListViewDay {
  date: Date;
  dayLabel: string;
  subLabel: string;
  status: 'available' | 'none';
  sessionsScheduled?: number;
  sessionsInUnavailable?: number;
  onClick?: () => void;
}

interface ScheduleListViewProps {
  days: ScheduleListViewDay[];
  activeView: 'week' | 'month';
  onPrev: () => void;
  onNext: () => void;
  onToggleView: (view: 'week' | 'month') => void;
  rangeLabel: string;
}

export default function ScheduleListView({
  days,
  activeView,
  onPrev,
  onNext,
  onToggleView,
  rangeLabel,
}: ScheduleListViewProps) {
  const isMobile = useIsMobile();
  
  return (
    <div className="space-y-4">
      {/* Header with range label and navigation */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b">
        <div className="px-4 py-2">
          {/* Range label above buttons */}
          <div className="text-center text-sm font-medium mb-2">{rangeLabel}</div>

          {/* Navigation and view toggle */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              className="text-sm"
              aria-label={`Previous ${activeView}`}
            >
              Previous
            </Button>

            <ToggleGroup
              type="single"
              value={activeView}
              onValueChange={(value: 'week' | 'month') => {
                if (value) onToggleView(value);
              }}
              className="bg-muted/50 p-1 rounded-lg"
            >
              <ToggleGroupItem value="week" className="text-xs px-3">
                Week
              </ToggleGroupItem>
              <ToggleGroupItem value="month" className="text-xs px-3">
                Month
              </ToggleGroupItem>
            </ToggleGroup>

            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              className="text-sm"
              aria-label={`Next ${activeView}`}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Daily rows */}
      <div className="space-y-2 px-4 pb-4">
        {days.map((day) => {
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(day.date, 'yyyy-MM-dd');
          
          if (day.status === 'none') {
            return (
              <div
                key={day.date.toISOString()}
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
                    <span className="text-base font-semibold text-muted-foreground">{day.dayLabel}</span>
                    <span className="text-xs text-muted-foreground">{day.subLabel}</span>
                    {isMobile && (
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Sessions scheduled: {day.sessionsScheduled ?? 0}
                        </span>

                        {(day.sessionsInUnavailable ?? 0) > 0 && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px]">
                            {day.sessionsInUnavailable} in unavailable
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">No availability</span>
                </div>
              </div>
            );
          }

          return (
            <Button
              key={day.date.toISOString()}
              onClick={day.onClick}
              variant="outline"
              className="h-auto w-full justify-between rounded-xl px-4 py-3 text-left hover:bg-accent hover:text-accent-foreground 
                transition-all duration-150 ease-out active:scale-[0.98] 
                motion-reduce:transition-none motion-reduce:active:scale-100"
              aria-pressed={false}
            >
              <div className="flex flex-col">
                {isToday && (
                  <span className="mb-1 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide w-fit bg-primary/10 text-primary">
                    Today
                  </span>
                )}
                <span className="text-base font-semibold">{day.dayLabel}</span>
                <span className="text-xs text-muted-foreground">{day.subLabel}</span>
                {isMobile && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Sessions scheduled: {day.sessionsScheduled ?? 0}
                    </span>

                    {(day.sessionsInUnavailable ?? 0) > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px]">
                        {day.sessionsInUnavailable} in unavailable
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="text-sm font-medium text-primary">Available</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}