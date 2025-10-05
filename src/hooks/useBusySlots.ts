// src/hooks/useBusySlots.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GetTrainerBusySlot, GetTrainerBusySlotsArgs } from "@/types/rpc";

export function useBusySlots(
  trainerId: string | null | undefined,
  windowStart: Date,
  windowEnd: Date,
  enabled: boolean = true
) {
  const [busy, setBusy] = useState<GetTrainerBusySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startISO = useMemo(() => windowStart.toISOString(), [windowStart]);
  const endISO   = useMemo(() => windowEnd.toISOString(),   [windowEnd]);

  const fetchBusy = useCallback(async () => {
    if (!enabled || !trainerId) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .rpc("get_trainer_busy_slots", {
        p_trainer_id: String(trainerId),
        p_start_date: startISO,
        p_end_date: endISO,
      });

    if (error) {
      setError(error.message || "Failed to fetch busy slots");
      setBusy([]);
    } else {
      setBusy((data as GetTrainerBusySlot[]) ?? []);
    }
    setLoading(false);
  }, [trainerId, startISO, endISO, enabled]);

  useEffect(() => {
    fetchBusy();
  }, [fetchBusy]);

  return { busy, loading, error, refetch: fetchBusy };
}
