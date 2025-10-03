// src/hooks/useUniversalCalendar.ts
// COMPLETE FIX: Restores view/navigation API expected by UniversalCalendar.tsx,
// uses the corrected parameterized RPC, and provides a simple availableSlots fallback.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  addWeeks,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  isSameDay,
} from "date-fns";
// ✅ Use the real Supabase client location in this repo:
import { supabase } from "@/integrations/supabase/client";

export type CalendarView = "month" | "week" | "day";

export type BusyStatus =
  | "scheduled"
  | "completed"
  | "pending"
  | "rescheduled"
  | "confirmed"
  | "booked"
  | "in-progress"
  | "checked-in"
  | string;

export type BusySlot = {
  session_date: string; // ISO string (UTC)
  status: BusyStatus;
};

export type AvailableSlot = {
  start: string; // ISO (UTC)
  end: string;   // ISO (UTC)
};

type Params = {
  trainerId: string;
  initialView?: CalendarView;     // default 'week'
  initialDate?: Date;             // default new Date()
  slotMinutes?: number;           // default 60
  dayStartHour?: number;          // default 6
  dayEndHour?: number;            // default 22
  timezone?: string;              // logical TZ for computing day windows; default 'Australia/Melbourne'
  enabled?: boolean;              // default true; gate network calls
};

type Result = {
  // data
  busySlots: BusySlot[];
  availableSlots: AvailableSlot[]; // simple complement generator per day window
  isLoading: boolean;
  error: string | null;

  // view state expected by UniversalCalendar.tsx
  view: CalendarView;
  currentDisplayMonth: Date;
  handleViewChange: (next: CalendarView) => void;
  handleNextMonth: () => void;
  handlePrevMonth: () => void;
  handleDayClick: (d: Date) => void;

  // useful extras
  startDate: Date;
  endDate: Date;
  windowStartISO: string;
  windowEndISO: string;

  // manual refresh
  refetch: () => Promise<void>;
};

function clampHours(date: Date, hour: number, minute = 0, second = 0, ms = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, second, ms);
  return d;
}

// Generate simple hourly availability inside the configured day window,
// and subtract any busy slots that start within the same hour.
function generateAvailableSlots(
  viewStart: Date,
  viewEnd: Date,
  dayStartHour: number,
  dayEndHour: number,
  slotMinutes: number,
  busy: BusySlot[]
): AvailableSlot[] {
  // Map busy starts to a fast lookup key "YYYY-MM-DDTHH:mm"
  const key = (d: Date) => {
    const iso = d.toISOString();
    return iso.slice(0, 16); // YYYY-MM-DDTHH:mm
  };

  const busyKeySet = new Set<string>(
    busy.map((b) => key(new Date(b.session_date)))
  );

  const slots: AvailableSlot[] = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (
    let day = startOfDay(viewStart).getTime();
    day <= startOfDay(viewEnd).getTime();
    day += dayMs
  ) {
    const dayDate = new Date(day);
    const startWindow = clampHours(dayDate, dayStartHour);
    const endWindow = clampHours(dayDate, dayEndHour);

    for (
      let t = startWindow.getTime();
      t < endWindow.getTime();
      t += slotMinutes * 60 * 1000
    ) {
      const s = new Date(t);
      const e = new Date(t + slotMinutes * 60 * 1000);
      // If there is a busy starting in this slot, skip it
      if (!busyKeySet.has(key(s))) {
        slots.push({ start: s.toISOString(), end: e.toISOString() });
      }
    }
  }
  return slots;
}

export default function useUniversalCalendar({
  trainerId,
  initialView = "week",
  initialDate = new Date(),
  slotMinutes = 60,
  dayStartHour = 6,
  dayEndHour = 22,
  timezone = "Australia/Melbourne", // reserved for future tz-aware boundaries
  enabled = true,
}: Params): Result {
  // View & navigation state that UniversalCalendar.tsx expects:
  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState<Date>(
    startOfMonth(initialDate)
  );

  // Derive the active time window based on view + currentDisplayMonth
  const { startDate, endDate } = useMemo(() => {
    if (view === "month") {
      return {
        startDate: startOfDay(startOfMonth(currentDisplayMonth)),
        endDate: endOfDay(endOfMonth(currentDisplayMonth)),
      };
    }
    if (view === "week") {
      // Week starts on Monday (1). Change to 0 for Sunday if needed.
      return {
        startDate: startOfDay(startOfWeek(currentDisplayMonth, { weekStartsOn: 1 })),
        endDate: endOfDay(endOfWeek(currentDisplayMonth, { weekStartsOn: 1 })),
      };
    }
    // day
    return {
      startDate: startOfDay(currentDisplayMonth),
      endDate: endOfDay(currentDisplayMonth),
    };
  }, [view, currentDisplayMonth]);

  const windowStartISO = useMemo(() => startDate.toISOString(), [startDate]);
  const windowEndISO = useMemo(() => endDate.toISOString(), [endDate]);

  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Compute available slots on-the-fly from busy slots:
  const availableSlots = useMemo(
    () =>
      generateAvailableSlots(
        startDate,
        endDate,
        dayStartHour,
        dayEndHour,
        slotMinutes,
        busySlots
      ),
    [startDate, endDate, dayStartHour, dayEndHour, slotMinutes, busySlots]
  );

  // Fetch busy slots via RPC (parameterized) for the current window
  const abortRef = useRef<AbortController | null>(null);
  const fetchBusy = useCallback(async () => {
    if (!enabled) return;
    if (!trainerId) {
      setBusySlots([]);
      setError("Missing trainerId");
      return;
    }
    if (startDate > endDate) {
      setBusySlots([]);
      setError("startDate must be <= endDate");
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.rpc(
        "get_trainer_busy_slots",
        {
          p_trainer_id: trainerId,
          p_start_date: windowStartISO,
          p_end_date: windowEndISO,
        },
        // @ts-expect-error: supabase-js fetch supports signal; types may not
        { signal: controller.signal }
      );
      if (error) throw error;

      const mapped: BusySlot[] = (data ?? []).map(
        (row: { session_date: string; status: string }) => ({
          session_date: row.session_date,
          status: row.status,
        })
      );
      setBusySlots(mapped);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setBusySlots([]);
      setError(e?.message || "Failed to load busy slots");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  }, [trainerId, windowStartISO, windowEndISO, enabled, startDate, endDate]);

  useEffect(() => {
    fetchBusy();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchBusy]);

  // Navigation API expected by UniversalCalendar.tsx
  const handleViewChange = useCallback((next: CalendarView) => {
    setView(next);
  }, []);

  const handleNextMonth = useCallback(() => {
    if (view === "month") setCurrentDisplayMonth((d) => addMonths(d, 1));
    else if (view === "week") setCurrentDisplayMonth((d) => addWeeks(d, 1));
    else setCurrentDisplayMonth((d) => addDays(d, 1));
  }, [view]);

  const handlePrevMonth = useCallback(() => {
    if (view === "month") setCurrentDisplayMonth((d) => addMonths(d, -1));
    else if (view === "week") setCurrentDisplayMonth((d) => addWeeks(d, -1));
    else setCurrentDisplayMonth((d) => addDays(d, -1));
  }, [view]);

  const handleDayClick = useCallback((day: Date) => {
    // Keep behavior predictable: when a day is clicked in month/week, switch to 'day' view
    // and set the current display to that date.
    setCurrentDisplayMonth(startOfDay(day));
    setView("day");
  }, []);

  const refetch = useCallback(async () => {
    await fetchBusy();
  }, [fetchBusy]);

  return {
    busySlots,
    availableSlots,
    isLoading,
    error,

    view,
    currentDisplayMonth,
    handleViewChange,
    handleNextMonth,
    handlePrevMonth,
    handleDayClick,

    startDate,
    endDate,
    windowStartISO,
    windowEndISO,

    refetch,
  };
}

// 👇 Backward-compatible named export (some files may still import { useUniversalCalendar })
export { default as useUniversalCalendar };