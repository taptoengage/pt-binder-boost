// cancel-session-pack edge function
// Handles cancelling a session pack by either forfeiting or refunding remaining sessions
// Requires authentication. Only the trainer who owns the pack may cancel it.
// - Blocks cancellation if any sessions for the pack are currently scheduled
// - Archives the pack and records forfeited/refunded counts and optional notes

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create an auth-aware client using the caller's JWT so RLS policies apply
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    // Authenticate user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = userData.user.id;

    // Parse payload
    const { packId, cancellationType, notes } = await req.json().catch(() => ({}));

    if (!packId || !cancellationType || !['forfeit', 'refund'].includes(cancellationType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: 'packId and cancellationType (forfeit|refund) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the pack with RLS applied (caller must be able to see it)
    const { data: pack, error: packError } = await supabase
      .from('session_packs')
      .select('id, trainer_id, sessions_remaining, status')
      .eq('id', packId)
      .single();

    if (packError || !pack) {
      return new Response(
        JSON.stringify({ error: 'Pack not found', details: packError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only the trainer can cancel a pack
    if (pack.trainer_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', details: 'Only the trainer can cancel this pack' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional: prevent double-cancellation if already archived
    if (pack.status === 'archived') {
      return new Response(
        JSON.stringify({ error: 'Pack already archived' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block cancellation if there are scheduled sessions
    const { data: scheduled, error: scheduledErr } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('session_pack_id', packId)
      .eq('status', 'scheduled');

    if (scheduledErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to check scheduled sessions', details: scheduledErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // When using head: true, data is null; use count from the response
    const scheduledCount = (scheduled as unknown as any)?.length ?? (scheduled as unknown as any)?.count ?? (scheduled as any)?.[0]?.count ?? 0;
    // Fallback: perform a lightweight select to ensure we have a count if needed
    let finalScheduledCount = 0;
    if (typeof scheduledCount !== 'number') {
      const { count: c2, error: countErr } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('session_pack_id', packId)
        .eq('status', 'scheduled');
      if (countErr) {
        return new Response(
          JSON.stringify({ error: 'Failed to check scheduled sessions', details: countErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      finalScheduledCount = c2 ?? 0;
    } else {
      finalScheduledCount = scheduledCount;
    }

    if (finalScheduledCount > 0) {
      return new Response(
        JSON.stringify({ error: 'Cannot cancel a pack with scheduled sessions.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare update based on cancellation type
    const remaining = pack.sessions_remaining ?? 0;
    const updateData: Record<string, unknown> = {
      status: 'archived',
      sessions_remaining: 0,
      cancellation_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    };

    if (cancellationType === 'forfeit') {
      updateData.forfeited_sessions = remaining;
      updateData.refunded_sessions = 0;
    } else if (cancellationType === 'refund') {
      updateData.refunded_sessions = remaining;
      updateData.forfeited_sessions = 0;
    }

    const { data: updatedPack, error: updateError } = await supabase
      .from('session_packs')
      .update(updateData)
      .eq('id', packId)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update pack', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO (future): create credit note for refunds

    return new Response(JSON.stringify(updatedPack), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('cancel-session-pack error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
