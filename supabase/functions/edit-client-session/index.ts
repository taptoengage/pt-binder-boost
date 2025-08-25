import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Authorization header is missing' }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { 'Authorization': authHeader } }
    }
  );

  try {
    const { sessionId, sessionDate, notes } = await req.json();

    // Validate required fields
    if (!sessionId || !sessionDate) {
      return new Response(JSON.stringify({ error: 'Session ID and date are required' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Edit session request:', { sessionId, sessionDate, notes });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get client record for the authenticated user
    const { data: clientData, error: clientError } = await supabaseUserClient
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (clientError || !clientData) {
      console.error('Client lookup error:', clientError);
      return new Response(JSON.stringify({ error: 'Client not found' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch the existing session to verify ownership and get current details
    const { data: existingSession, error: fetchError } = await supabaseUserClient
      .from('sessions')
      .select('session_date, client_id, trainer_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !existingSession) {
      console.error('Session fetch error:', fetchError);
      return new Response(JSON.stringify({ error: 'Session not found or access denied' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify client ownership
    if (existingSession.client_id !== clientData.id) {
      console.error('Ownership verification failed:', { sessionClientId: existingSession.client_id, userClientId: clientData.id });
      return new Response(JSON.stringify({ error: 'You do not have permission to edit this session' }), { 
        status: 403, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check 24-hour policy
    const now = new Date();
    const sessionStartTime = new Date(existingSession.session_date);
    const hoursUntilSession = (sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilSession <= 24) {
      console.log('24-hour policy violation:', { hoursUntilSession });
      return new Response(JSON.stringify({ error: 'Cannot edit session within 24 hours of its start time' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for overlapping sessions for this trainer (1-hour duration)
    const proposedStart = new Date(sessionDate);
    const proposedEnd = new Date(proposedStart.getTime() + 60 * 60 * 1000);

    const { data: possibleOverlaps, error: overlapError } = await supabaseUserClient
      .from('sessions')
      .select('id, session_date, status')
      .eq('trainer_id', existingSession.trainer_id)
      .neq('id', sessionId)
      .in('status', ['scheduled', 'completed']);

    if (overlapError) {
      console.error('Overlap check error:', overlapError);
      return new Response(JSON.stringify({ error: 'Failed to validate timeslot' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const hasOverlap = (possibleOverlaps || []).some((s: any) => {
      const start = new Date(s.session_date);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return proposedStart < end && proposedEnd > start;
    });

    if (hasOverlap) {
      return new Response(JSON.stringify({ error: 'This timeslot overlaps with another session.' }), { 
        status: 409, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update the session using service role key for reliable updates
    const { data: updatedSession, error: updateError } = await supabaseClient
      .from('sessions')
      .update({
        session_date: sessionDate,
        notes: notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('Session update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update session' }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Session updated successfully:', updatedSession);

    return new Response(JSON.stringify({ success: true, updatedSession }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Unexpected error in edit-client-session:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});