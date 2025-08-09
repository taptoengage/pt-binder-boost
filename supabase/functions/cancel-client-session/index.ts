import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization header is missing' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { sessionId, penalize } = await req.json();
    
    // NEW DEBUG LOGS: Log the raw 'penalize' parameter and its type
    console.log(`DEBUG: Raw 'penalize' received:`, penalize);
    console.log(`DEBUG: Type of 'penalize':`, typeof penalize);
    console.log(`DEBUG: SessionId received:`, sessionId);
    
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find client by email to validate ownership
    const { data: clientRow, error: clientErr } = await supabaseUser
      .from('clients')
      .select('id')
      .eq('email', user.email)
      .single();

    if (clientErr || !clientRow) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch session details
    const { data: session, error: sessErr } = await supabaseUser
      .from('sessions')
      .select('id, client_id, trainer_id, session_pack_id, subscription_id, status, session_date, service_type_id, is_from_credit, credit_id_consumed')
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: 'Session not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (session.client_id !== clientRow.id) {
      return new Response(JSON.stringify({ error: 'You do not have permission to cancel this session' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine penalty if not explicitly provided
    let doPenalize = penalize;
    if (doPenalize === undefined) {
      const now = new Date();
      const start = new Date(session.session_date);
      const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
      doPenalize = hoursUntil <= 24;
    }

    // NEW DEBUG LOGS FOR PENALTY DETERMINATION
    console.log(`DEBUG: Penalty check for session ${sessionId}:`);
    console.log(`DEBUG:   Frontend 'penalize' param: ${penalize}`);
    console.log(`DEBUG:   Calculated 'doPenalize' (before if): ${doPenalize}`);
    console.log(`DEBUG:   Current time (now): ${new Date().toISOString()}`);
    console.log(`DEBUG:   Session start time: ${new Date(session.session_date).toISOString()}`);
    console.log(`DEBUG:   Hours until session: ${(new Date(session.session_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)}`);
    console.log(`DEBUG:   Session pack ID: ${session.session_pack_id}`);
    console.log(`DEBUG:   Subscription ID: ${session.subscription_id}`);
    
    console.log(`Processing cancellation for session ${sessionId}, penalize: ${doPenalize}`);

    // Handle penalty logic: when penalized, treat as completed (no refunds)
    // When not penalized, refund pack/subscription credits
    if (!doPenalize) {
      console.log('Non-penalty cancellation: processing refunds/credits');
      
      // If from pack, increment sessions_remaining back by 1 using atomic RPC
      if (session.session_pack_id) {
        try {
          const { data: incResult, error: rpcErr } = await supabaseService
            .rpc('increment_pack_sessions', {
              pack_id: session.session_pack_id,
              trainer_id: session.trainer_id,
              inc: 1,
            });
          if (rpcErr) {
            console.error('RPC increment_pack_sessions error:', rpcErr, {
              pack_id: session.session_pack_id,
              trainer_id: session.trainer_id,
            });
          } else {
            console.log('increment_pack_sessions succeeded:', incResult);
          }
        } catch (e) {
          console.error('Unexpected error calling increment_pack_sessions:', e);
        }
      }

      // If from subscription, return used credit or create a new one
      if (session.subscription_id) {
        if (session.is_from_credit && session.credit_id_consumed) {
          const { error: creditRevertErr } = await supabaseService
            .from('subscription_session_credits')
            .update({ status: 'available', used_at: null })
            .eq('id', session.credit_id_consumed);
          if (creditRevertErr) {
            console.error('Error reverting used credit:', creditRevertErr);
          } else {
            console.log('Successfully reverted consumed credit:', session.credit_id_consumed);
          }
        } else {
          // Determine credit_value from allocation if available
          let creditValue = 0;
          const { data: allocation, error: allocErr } = await supabaseService
            .from('subscription_service_allocations')
            .select('cost_per_session')
            .eq('subscription_id', session.subscription_id)
            .eq('service_type_id', session.service_type_id)
            .maybeSingle();
          if (!allocErr && allocation?.cost_per_session != null) {
            creditValue = Number(allocation.cost_per_session);
          }

          const { error: insertCreditErr } = await supabaseService
            .from('subscription_session_credits')
            .insert({
              subscription_id: session.subscription_id,
              service_type_id: session.service_type_id,
              credit_amount: 1,
              credit_reason: 'cancellation',
              credit_value: creditValue,
              status: 'available',
            });
          if (insertCreditErr) {
            console.error('Error creating credit on cancellation:', insertCreditErr);
          } else {
            console.log('Successfully created cancellation credit for subscription:', session.subscription_id);
          }
        }
      }
    } else {
      console.log('Penalty cancellation: no refunds/credits processed - treating as completed session');
    }

    // Finally mark the session as cancelled
    const { data: updated, error: cancelErr } = await supabaseService
      .from('sessions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', session.id)
      .select()
      .single();

    if (cancelErr) {
      console.error('Error cancelling session:', cancelErr);
      return new Response(JSON.stringify({ error: 'Failed to cancel session' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, session: updated }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error in cancel-client-session:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
