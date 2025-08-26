import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Define the necessary type directly within the function to avoid import issues.
// This makes the function self-contained.
type SessionPackUpdate = {
  status?: string;
  sessions_remaining?: number;
  cancellation_notes?: string | null;
  forfeited_sessions?: number;
  refunded_sessions?: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const { packId, cancellationType, notes } = await req.json().catch(() => ({}));

    if (!packId || !cancellationType || !['forfeit', 'refund'].includes(cancellationType)) {
      return new Response(JSON.stringify({ error: 'Invalid request: packId and cancellationType are required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: pack, error: packError } = await supabase
      .from('session_packs')
      .select('id, trainer_id, sessions_remaining, status')
      .eq('id', packId)
      .single();

    if (packError || !pack) {
      return new Response(JSON.stringify({ error: 'Pack not found or you do not have permission to view it.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pack.trainer_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden: You are not the trainer for this pack.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (pack.status === 'archived') {
      return new Response(JSON.stringify({ error: 'This pack has already been archived.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { count: scheduledCount, error: scheduledErr } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('session_pack_id', packId)
      .eq('status', 'scheduled');

    if (scheduledErr) {
      throw scheduledErr;
    }

    if (scheduledCount && scheduledCount > 0) {
      return new Response(JSON.stringify({ error: `Cannot cancel a pack with ${scheduledCount} scheduled session(s).` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const remainingSessions = pack.sessions_remaining ?? 0;
    
    // This is the corrected update object using the locally defined type
    const updateData: SessionPackUpdate = {
      status: 'archived',
      sessions_remaining: 0,
      cancellation_notes: notes ?? null,
    };

    if (cancellationType === 'forfeit') {
      updateData.forfeited_sessions = remainingSessions;
      updateData.refunded_sessions = 0;
    } else if (cancellationType === 'refund') {
      updateData.refunded_sessions = remainingSessions;
      updateData.forfeited_sessions = 0;
    }

    const { data: updatedPack, error: updateError } = await supabase
      .from('session_packs')
      .update(updateData)
      .eq('id', packId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify(updatedPack), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Critical Error in cancel-session-pack:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
