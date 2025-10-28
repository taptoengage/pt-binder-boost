// supabase/functions/generate-recurring-sessions/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.51.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { fromZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";

type Action = "preview" | "confirm";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const TRAINER_TZ = "Australia/Melbourne";
const MAX_SESSIONS_PER_SCHEDULE = 200;

const Schema = z.object({
  action: z.enum(["preview", "confirm"]),
  trainerId: z.string().uuid(),
  clientId: z.string().uuid(),
  preferenceIds: z.array(z.string().uuid()).min(1).max(10),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bookingMethod: z.enum(["one-off", "pack", "subscription"]),
  sessionPackId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
  serviceTypeId: z.string().uuid(),
  patternName: z.string().max(100).optional(),
  excludedSessions: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) }))
    .optional(),
});

function toUtcIso(datePart: string, timeHHmm: string): string {
  const [h, m] = timeHHmm.split(":").map(Number);
  const [Y, M, D] = datePart.split("-").map(Number);
  // Create a Date object with the wall-clock date/time
  const wall = new Date(Y, M - 1, D, h, m, 0, 0);
  // Convert to UTC respecting Melbourne DST
  return fromZonedTime(wall, TRAINER_TZ).toISOString();
}

function excluded(date: string, time: string, list?: Array<{ date: string; time: string }>) {
  return !!list?.some(e => e.date === date && e.time === time);
}

function deterministicIdempotencyKey(input: {
  trainerId: string; clientId: string; preferenceIds: string[];
  startDate: string; endDate: string; bookingMethod: string;
  sessionPackId?: string; subscriptionId?: string; serviceTypeId: string;
}): string {
  const prefs = [...input.preferenceIds].sort().join(",");
  const raw = [
    input.trainerId, input.clientId, prefs,
    input.startDate, input.endDate, input.bookingMethod,
    input.sessionPackId ?? "", input.subscriptionId ?? "", input.serviceTypeId
  ].join("|");
  // Short hash to keep index size reasonable
  let h = 0; for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (Deno.env.get("RECURRING_SESSIONS_V1") !== "true") {
      return new Response(JSON.stringify({ error: "Feature not available" }), { status: 404, headers: cors });
    }

    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(url, anon, { global: { headers: { Authorization: auth } } });

    // Validate request
    const body = Schema.parse(await req.json());

    // Auth user
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    // Trainer must own this client
    const { data: client, error: clientErr } = await supabase
      .from("clients").select("id, trainer_id").eq("id", body.clientId).single();
    if (clientErr || !client || client.trainer_id !== body.trainerId || user.id !== body.trainerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    }

    // Pull preferences
    const { data: prefs, error: prefErr } = await supabase
      .from("client_time_preferences")
      .select("id, weekday, start_time")
      .eq("client_id", body.clientId)
      .eq("is_active", true)
      .in("id", body.preferenceIds);
    if (prefErr) return new Response(JSON.stringify({ error: prefErr.message }), { status: 400, headers: cors });
    if (!prefs?.length) return new Response(JSON.stringify({ error: "No active preferences" }), { status: 400, headers: cors });

    // Generate weekly occurrences
    const start = new Date(body.startDate + "T00:00:00Z");
    const end = new Date(body.endDate + "T00:00:00Z");
    if (end <= start) return new Response(JSON.stringify({ error: "endDate must be after startDate" }), { status: 400, headers: cors });

    const proposed: Array<{date:string; time:string; weekday:number; prefId:string; utc:string; status:"ok"|"conflict"|"warning"; message?:string}> = [];

    for (const p of prefs) {
      // find first matching weekday on/after start
      const first = new Date(start);
      while (first.getUTCDay() !== p.weekday) first.setUTCDate(first.getUTCDate() + 1);
      let cur = new Date(first);
      while (cur <= end) {
        const dateStr = cur.toISOString().slice(0,10);
        const timeStr = String(p.start_time).slice(0,5);
        if (!excluded(dateStr, timeStr, body.excludedSessions)) {
          proposed.push({ date: dateStr, time: timeStr, weekday: p.weekday, prefId: p.id, utc: toUtcIso(dateStr, timeStr), status: "ok" });
        }
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
    }
    proposed.sort((a,b)=>a.utc.localeCompare(b.utc));

    if (proposed.length > MAX_SESSIONS_PER_SCHEDULE) {
      return new Response(JSON.stringify({ error: `Too many sessions (${proposed.length}). Max ${MAX_SESSIONS_PER_SCHEDULE}` }), { status: 400, headers: cors });
    }

    // TODO: Reuse existing validations for availability/overlaps.
    // Example placeholder (wire to your shared code or RPC):
    // const conflicts = await checkConflictsForProposed(supabase, body.trainerId, proposed.map(p => p.utc));
    // mark proposed[i].status/message accordingly and block on confirm if conflicts remain.

    if (body.action === "preview") {
      return new Response(JSON.stringify({
        success: true,
        proposedSessions: proposed.map(p => ({ date: p.date, time: p.time, weekday: p.weekday, preferenceId: p.prefId, status: p.status })),
        warnings: [],
        stats: { totalProposed: proposed.length, conflicts: proposed.filter(p=>p.status==="conflict").length, warnings: proposed.filter(p=>p.status==="warning").length }
      }), { status: 200, headers: cors });
    }

    // ===== CONFIRM =====
    const idempotencyKey = deterministicIdempotencyKey({
      trainerId: body.trainerId, clientId: body.clientId, preferenceIds: body.preferenceIds,
      startDate: body.startDate, endDate: body.endDate, bookingMethod: body.bookingMethod,
      sessionPackId: body.sessionPackId, subscriptionId: body.subscriptionId, serviceTypeId: body.serviceTypeId
    });

    // Up-front idempotency check
    const { data: existing } = await supabase
      .from("recurring_schedules")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, recurringScheduleId: existing.id, sessionsCreated: 0, message: "Idempotent: already created" }), { status: 200, headers: cors });
    }

    // Create schedule
    const { data: schedule, error: schedErr } = await supabase
      .from("recurring_schedules")
      .insert({
        trainer_id: body.trainerId,
        client_id: body.clientId,
        pattern_name: body.patternName ?? null,
        start_date: body.startDate,
        end_date: body.endDate,
        booking_method: body.bookingMethod,
        session_pack_id: body.sessionPackId ?? null,
        subscription_id: body.subscriptionId ?? null,
        service_type_id: body.serviceTypeId,
        status: "active",
        total_sessions_generated: proposed.length,
        last_generated_date: new Date().toISOString(),
        created_by: user.id,
        idempotency_key: idempotencyKey
      })
      .select()
      .single();

    if (schedErr || !schedule) {
      console.error("[RECURRING] Failed to create schedule:", schedErr);
      return new Response(JSON.stringify({ error: "Failed to create recurring schedule", details: schedErr?.message }), { status: 500, headers: cors });
    }

    // Insert preference links into join table
    const prefLinks = body.preferenceIds.map(prefId => ({
      recurring_schedule_id: schedule.id,
      preference_id: prefId
    }));
    
    const { error: prefLinkErr } = await supabase
      .from("recurring_schedule_preferences")
      .insert(prefLinks);
    
    if (prefLinkErr) {
      console.error("[RECURRING] Failed to link preferences:", prefLinkErr);
      await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
      return new Response(JSON.stringify({ error: "Failed to link preferences", details: prefLinkErr.message }), { status: 500, headers: cors });
    }

    // Insert sessions
    const sessionRows = proposed
      .filter(p => p.status !== "conflict")
      .map(p => ({
        trainer_id: body.trainerId,
        client_id: body.clientId,
        session_date: p.utc,
        status: "scheduled",
        service_type_id: body.serviceTypeId,
        session_pack_id: body.sessionPackId ?? null,
        subscription_id: body.subscriptionId ?? null,
        recurring_schedule_id: schedule.id,
        notes: `Recurring schedule ${schedule.id}`
      }));

    const { error: insertErr } = await supabase.from("sessions").insert(sessionRows);
    if (insertErr) {
      console.error("[RECURRING] Failed to insert sessions:", insertErr);
      await supabase.from("recurring_schedule_preferences").delete().eq("recurring_schedule_id", schedule.id);
      await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
      return new Response(JSON.stringify({ error: "Failed to create sessions", details: insertErr.message }), { status: 500, headers: cors });
    }

    // Atomic pack decrement (if pack) - guarded UPDATE with rollback
    if (body.bookingMethod === "pack" && body.sessionPackId) {
      // Step 1: Query current state with guards
      const { data: packData, error: packQueryErr } = await supabase
        .from("session_packs")
        .select("sessions_remaining, service_type_id")
        .eq("id", body.sessionPackId)
        .eq("trainer_id", body.trainerId)
        .single();

      if (packQueryErr || !packData) {
        console.error("[RECURRING] Pack not found:", packQueryErr);
        await supabase.from("sessions").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedule_preferences").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
        return new Response(JSON.stringify({ 
          error: "Session pack not found or access denied" 
        }), { status: 403, headers: cors });
      }

      // Step 2: Verify service type match
      if (packData.service_type_id !== body.serviceTypeId) {
        await supabase.from("sessions").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedule_preferences").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
        return new Response(JSON.stringify({ 
          error: "Service type mismatch with session pack" 
        }), { status: 400, headers: cors });
      }

      // Step 3: Verify sufficient capacity
      if (packData.sessions_remaining < sessionRows.length) {
        await supabase.from("sessions").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedule_preferences").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
        return new Response(JSON.stringify({ 
          error: "Insufficient pack capacity",
          details: `Pack has ${packData.sessions_remaining} sessions remaining, need ${sessionRows.length}`
        }), { status: 400, headers: cors });
      }

      // Step 4: Atomic decrement with race-condition guard
      // Update ONLY if sessions_remaining hasn't changed since query
      const newRemaining = packData.sessions_remaining - sessionRows.length;
      const { data: updateResult, error: updateErr } = await supabase
        .from("session_packs")
        .update({ 
          sessions_remaining: newRemaining,
          updated_at: new Date().toISOString()
        })
        .eq("id", body.sessionPackId)
        .eq("trainer_id", body.trainerId)
        .eq("sessions_remaining", packData.sessions_remaining) // Race guard
        .select()
        .maybeSingle();

      // If no rows affected, concurrent modification occurred
      if (updateErr || !updateResult) {
        console.error("[RECURRING] Concurrent modification detected:", updateErr);
        await supabase.from("sessions").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedule_preferences").delete().eq("recurring_schedule_id", schedule.id);
        await supabase.from("recurring_schedules").delete().eq("id", schedule.id);
        return new Response(JSON.stringify({ 
          error: "Concurrent modification detected - pack was updated by another process",
          details: "Please retry the operation"
        }), { status: 409, headers: cors });
      }

      console.log("[RECURRING] Pack decremented successfully", { 
        packId: body.sessionPackId, 
        previousRemaining: packData.sessions_remaining,
        decremented: sessionRows.length,
        newRemaining: updateResult.sessions_remaining
      });
    }

    console.log("[RECURRING] confirmed", { 
      scheduleId: schedule.id, 
      sessionsCreated: sessionRows.length, 
      trainerId: body.trainerId, 
      clientId: body.clientId,
      bookingMethod: body.bookingMethod,
      sessionPackId: body.sessionPackId
    });

    return new Response(JSON.stringify({
      success: true,
      recurringScheduleId: schedule.id,
      sessionsCreated: sessionRows.length,
      message: `Created ${sessionRows.length} recurring sessions`
    }), { status: 200, headers: cors });

  } catch (err: any) {
    console.error("generate-recurring-sessions error:", err?.message || err);
    const msg = err?.issues ? "Invalid request" : "Internal server error";
    return new Response(JSON.stringify({ error: msg, details: err?.issues ?? err?.message }), { status: 400, headers: cors });
  }
});
