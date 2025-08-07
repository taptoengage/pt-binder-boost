import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addMinutes, parseISO, isSameDay, setHours, setMinutes } from 'https://esm.sh/date-fns@3.3.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_SESSION_DURATION_MINUTES = 60

// This Edge Function is secured and requires a JWT
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header is missing' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const token = authHeader.replace('Bearer ', '');

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Create a client with the user's JWT for RLS-enforced queries
  const supabaseUserClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    }
  );

  try {
    const { 
      clientId, 
      trainerId, 
      sessionDate, 
      serviceTypeId, 
      bookingMethod, 
      sourcePackId, 
      sourceSubscriptionId 
    } = await req.json();

    console.log('Booking request received:', {
      clientId,
      trainerId,
      sessionDate,
      serviceTypeId,
      bookingMethod,
      sourcePackId,
      sourceSubscriptionId
    });

    // 1. Verify user's identity and permissions (CRITICAL SECURITY CHECK)
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure the client ID in the request matches the authenticated user ID
    if (clientId !== user.id) {
      return new Response(
        JSON.stringify({ error: 'Client ID mismatch' }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Basic input validation
    if (!clientId || !trainerId || !sessionDate || !serviceTypeId || !bookingMethod) {
      return new Response(
        JSON.stringify({ error: 'Missing required booking data.' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse session date and time (sessionDate now includes full datetime)
    const sessionStartDate = parseISO(sessionDate);
    const sessionEndDate = addMinutes(sessionStartDate, DEFAULT_SESSION_DURATION_MINUTES);

    console.log('Parsed session times:', {
      start: sessionStartDate.toISOString(),
      end: sessionEndDate.toISOString()
    });

    // --- VALIDATION LOGIC ---

    // 1. Check for timeslot overlap with trainer's existing sessions
    const { data: overlappingSessions, error: overlapError } = await supabaseUserClient
      .from('sessions')
      .select('id, session_date')
      .eq('trainer_id', trainerId)
      .in('status', ['scheduled', 'completed']);

    if (overlapError) {
      console.error('Error checking overlaps:', overlapError);
      throw overlapError;
    }

    // Client-side filtering for actual time overlap
    const hasOverlap = overlappingSessions?.some((existingSession: any) => {
      const existingStart = new Date(existingSession.session_date);
      const existingEnd = addMinutes(existingStart, DEFAULT_SESSION_DURATION_MINUTES);

      // Check for overlap: [start1, end1) overlaps [start2, end2) if start1 < end2 AND end1 > start2
      return sessionStartDate < existingEnd && sessionEndDate > existingStart;
    });

    if (hasOverlap) {
      console.log('Time slot overlap detected');
      return new Response(
        JSON.stringify({ error: 'This time slot overlaps with an existing session.' }), 
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check client eligibility based on booking method
    let sessionPackId = null;
    let subscriptionId = null;
    let sessionStatus = 'scheduled'; // Default status

    switch (bookingMethod) {
      case 'pack':
        if (!sourcePackId) {
          return new Response(
            JSON.stringify({ error: 'Pack ID is required for pack booking.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: pack, error: packError } = await supabaseUserClient
          .from('session_packs')
          .select('id, sessions_remaining, service_type_id, status')
          .eq('id', sourcePackId)
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active')
          .single();

        if (packError || !pack) {
          console.error('Pack validation error:', packError);
          return new Response(
            JSON.stringify({ error: 'Invalid or inactive session pack.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (pack.sessions_remaining <= 0) {
          return new Response(
            JSON.stringify({ error: 'No sessions remaining in pack.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (pack.service_type_id !== serviceTypeId) {
          return new Response(
            JSON.stringify({ error: 'Service type does not match the selected pack.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        sessionPackId = sourcePackId;
        console.log('Pack validated successfully:', pack);
        break;

      case 'subscription':
        if (!sourceSubscriptionId) {
          return new Response(
            JSON.stringify({ error: 'Subscription ID is required for subscription booking.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: subscription, error: subError } = await supabaseUserClient
          .from('client_subscriptions')
          .select(`
            id, 
            status,
            subscription_service_allocations!inner(service_type_id, quantity_per_period)
          `)
          .eq('id', sourceSubscriptionId)
          .eq('client_id', clientId)
          .eq('trainer_id', trainerId)
          .eq('status', 'active')
          .single();

        if (subError || !subscription) {
          console.error('Subscription validation error:', subError);
          return new Response(
            JSON.stringify({ error: 'Invalid or inactive subscription.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if service type is allocated to subscription
        const serviceTypeExists = subscription.subscription_service_allocations.some(
          (allocation: any) => allocation.service_type_id === serviceTypeId
        );
        if (!serviceTypeExists) {
          return new Response(
            JSON.stringify({ error: 'Selected service type is not part of this subscription.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        subscriptionId = sourceSubscriptionId;
        console.log('Subscription validated successfully:', subscription);
        break;

      case 'one-off':
        // One-off sessions require trainer approval - use 'scheduled' status for now
        sessionStatus = 'scheduled';
        console.log('One-off session booking, status set to scheduled (awaiting trainer approval)');
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid booking method.' }), 
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // --- TRANSACTION AND CREATION LOGIC ---

    // Start database transaction by creating the session first
    const { data: newSession, error: insertError } = await supabaseClient
      .from('sessions')
      .insert({
        trainer_id: trainerId,
        client_id: clientId,
        session_date: sessionStartDate.toISOString(),
        status: sessionStatus,
        service_type_id: serviceTypeId,
        session_pack_id: sessionPackId,
        subscription_id: subscriptionId,
        notes: null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating session:', insertError);
      throw insertError;
    }

    console.log('Session created successfully:', newSession);

    // Update the source (pack remaining count) if booking from a pack
    if (bookingMethod === 'pack' && sessionPackId) {
      // Use service role client to safely decrement pack sessions
      const { error: decrementError } = await supabaseClient
        .from('session_packs')
        .update({ sessions_remaining: supabaseClient.raw('sessions_remaining - 1') })
        .eq('id', sessionPackId)
        .eq('trainer_id', trainerId); // Additional security check

      if (decrementError) {
        console.error('Error updating pack sessions:', decrementError);
        // Rollback session creation
        await supabaseClient.from('sessions').delete().eq('id', newSession.id);
        throw decrementError;
      }

      console.log('Pack sessions remaining decremented');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sessionId: newSession.id,
        message: sessionStatus === 'pending_approval' 
          ? 'Session request submitted for trainer approval.' 
          : 'Session booked successfully!'
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Booking failed:', error.message);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'An unexpected error occurred during booking.' 
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});