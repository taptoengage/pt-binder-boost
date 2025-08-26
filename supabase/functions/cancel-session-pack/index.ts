// cancel-session-pack edge function
// Handles cancelling a session pack by either forfeiting or refunding remaining sessions.
// Requires authentication. Only the trainer who owns the pack may cancel it.
// - Blocks cancellation if any sessions for the pack are currently scheduled.
// - Archives the pack and records forfeited/refunded counts and optional notes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Standard CORS headers for Supabase Edge Functions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the user's authentication token.
    // This ensures that all database operations respect RLS policies.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    // 1. Authenticate the user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = userData.user.id;

    // 2. Parse the request payload
    const { packId, cancellationType, notes } = await req.json().catch(() => ({}));

    if (!packId || !cancellationType || !['forfeit', 'refund'].includes(cancellationType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: 'packId and cancellationType (forfeit|refund) are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Fetch the session pack to verify ownership and status
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

    // 4. Authorize the action: ensure the user owns the pack
    if (pack.trainer_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', details: 'Only the trainer can cancel this pack' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Prevent cancelling a pack that is already archived
    if (pack.status === 'archived') {
      return new Response(
        JSON.stringify({ error: 'Pack already archived' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. BUSINESS RULE: Block cancellation if there are any scheduled sessions
    const { count: scheduledCount, error: scheduledErr } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('session_pack_id', packId)
      .eq('status', 'scheduled');

    if (scheduledErr) {
      return new Response(
        JSON.stringify({ error: 'Failed to check for scheduled sessions', details: scheduledErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (scheduledCount > 0) {
      return new Response(
        JSON.stringify({ error: `Cannot cancel a pack with ${scheduledCount} scheduled session(s).` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Prepare the update payload
    const remainingSessions = pack.sessions_remaining ?? 0;
    const updateData: Record<string, unknown> = {
      status: 'archived',
      sessions_remaining: 0,
      cancellation_notes: notes ?? null,
      updated_at: new Date().toISOString(),
    };

    if (cancellationType === 'forfeit') {
      updateData.forfeited_sessions = remainingSessions;
      updateData.refunded_sessions = 0; // Explicitly set to 0
    } else if (cancellationType === 'refund') {
      updateData.refunded_sessions = remainingSessions;
      updateData.forfeited_sessions = 0; // Explicitly set to 0
    }

    // 8. Execute the update
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

    // TODO (Future Story): Implement credit note generation for 'refund' types.

    // 9. Return the successful response
    return new Response(JSON.stringify(updatedPack), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    // Generic error handler for any unexpected issues
    console.error('Critical Error in cancel-session-pack:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});