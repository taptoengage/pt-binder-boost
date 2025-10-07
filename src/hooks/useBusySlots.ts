// src/hooks/useBusySlots.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { GetTrainerBusySlot, GetTrainerBusySlotsArgs } from "@/types/rpc";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  
  const isValid = useMemo(() => {
    return Boolean(
      trainerId && 
      UUID_RE.test(String(trainerId)) &&
      startISO &&
      endISO
    );
  }, [trainerId, startISO, endISO]);

  const fetchBusy = useCallback(async () => {
    if (!enabled || !isValid) {
      console.log("[useBusySlots] Skipping fetch - validation failed", {
        enabled,
        isValid,
        trainerId,
        hasStartISO: Boolean(startISO),
        hasEndISO: Boolean(endISO)
      });
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      p_trainer_id: trainerId,
      p_start_date: startISO,
      p_end_date: endISO,
    };
    
    console.log("[useBusySlots] FETCH", payload);

    const { data, error } = await supabase
      .rpc("get_trainer_busy_slots", payload);

    if (error) {
      console.error("[useBusySlots] RPC error", { error });
      setError(error.message || "Failed to fetch busy slots");
      setBusy([]);
      setLoading(false);
      return;
    }
    
    setBusy((data as GetTrainerBusySlot[]) ?? []);
    setLoading(false);
  }, [trainerId, startISO, endISO, enabled, isValid]);

  useEffect(() => {
    fetchBusy();
  }, [fetchBusy]);

  return { busy, loading, error, refetch: fetchBusy };
}
