// src/hooks/useUniversalCalendar.ts
// Drop-in replacement: fetches trainer busy slots via the parameterized RPC
// and exposes a simple hook API shared by client & trainer views.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// 🔧 Adjust this import path if your project uses a different client location:
import { supabase } from "@/lib/supabaseClient";

export type BusyStatus =
  | "scheduled"
  | "completed"
  | "pending"
  | "rescheduled"
  | "confirmed"
  | "booked"
  | "in-progress"
  | "checked-in";

export type BusySlot = {
  session_date: string; // ISO string (UTC)
  status: BusyStatus | string; // be lenient to avoid runtime crashes if new statuses appear
};

type UseUniversalCalendarParams = {
  trainerId: string;
  startDate: Date; // inclusive
  endDate: Date; // inclusive
  enabled?: boolean; // gate network calls (default true)
};

type UseUniversalCalendarResult = {
  busySlots: BusySlot[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  // For convenience if callers need the current window
  windowStartISO: string;
  windowEndISO: string;
};

/**
 * Single source of truth for trainer "busy" slots.
 * Uses the SECURITY DEFINER RPC: public.get_trainer_busy_slots(uuid, timestamptz, timestamptz)
 * Returns only session_date + status to respect privacy/RLS.
 */
export default function useUniversalCalendar(
  params: UseUniversalCalendarParams
): UseUniversalCalendarResult {
  const { trainerId, startDate, endDate, enabled = true } = params;

  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Stabilize ISO strings so equality checks & effects behave deterministically.
  const windowStartISO = useMemo(() => startDate.toISOString(), [startDate]);
  const windowEndISO = useMemo(() => endDate.toISOString(), [endDate]);

  // Abort in-flight requests on param changes/unmount to avoid race conditions.
  const abortRef = useRef<AbortController | null>(null);

  const fetchBusySlots = useCallback(async () => {
    if (!enabled) return;

    // Basic guards
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

    // Cancel any prior request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      // ✅ Correct, parameterized RPC call (this is the critical fix)
      const { data, error } = await supabase.rpc(
        "get_trainer_busy_slots",
        {
          p_trainer_id: trainerId,
          p_start_date: windowStartISO,
          p_end_date: windowEndISO,
        },
        { signal: controller.signal as any } // Supabase types don’t expose signal, but fetch does.
      );

      if (error) {
        throw error;
      }

      // The RPC already filters by trainer and date range and returns only:
      //   session_date (timestamptz) and status (text)
      // No client-side trainer_id filtering necessary or possible.
      const mapped: BusySlot[] = (data ?? []).map(
        (row: { session_date: string; status: string }) => ({
          session_date: row.session_date,
          status: row.status,
        })
      );

      setBusySlots(mapped);
    } catch (e: any) {
      // Ignore abort errors
      if (e?.name === "AbortError") return;
      setBusySlots([]);
      setError(e?.message || "Failed to load busy slots");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsLoading(false);
    }
  }, [trainerId, windowStartISO, windowEndISO, enabled, startDate, endDate]);

  useEffect(() => {
    fetchBusySlots();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchBusySlots]);

  const refetch = useCallback(async () => {
    await fetchBusySlots();
  }, [fetchBusySlots]);

  return { busySlots, isLoading, error, refetch, windowStartISO, windowEndISO };
}