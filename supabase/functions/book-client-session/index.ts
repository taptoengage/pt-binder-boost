import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addMinutes, parseISO, addHours, getDay, startOfWeek, endOfWeek } from 'https://esm.sh/date-fns@3.3.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Enhanced error response helper
function createErrorResponse(message: string, status: number, details?: any) {
  console.error(`Error ${status}: ${message}`, details ? JSON.stringify(details) : '');
  return new Response(
    JSON.stringify({ error: message, details }), 
    { 
      status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
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
    // Enhanced input parsing with validation
    let bookingData;
    try {
      bookingData = await req.json();
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return createErrorResponse('Invalid JSON request body', 400, { parseError: parseError.message });
    }

    const { 
      clientId, 
      trainerId, 
      sessionDate, 
      serviceTypeId, 
      bookingMethod, 
      sourcePackId, 
      sourceSubscriptionId 
    } = bookingData;

    console.log('Booking request received:', {
      clientId,
      trainerId,
      sessionDate,
      serviceTypeId,
      bookingMethod,
      sourcePackId,
      sourceSubscriptionId,
      timestamp: new Date().toISOString()
    });

    // 1. Verify user's identity and permissions (CRITICAL SECURITY CHECK)
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify that the client exists and belongs to the authenticated user via email lookup
    const { data: clientData, error: clientError } = await supabaseUserClient
      .from('clients')
      .select('id, email')
      .eq('id', clientId)
      .eq('email', user.email)
      .single();

    if (clientError || !clientData) {
      console.error('Client verification error:', clientError);
      return new Response(
        JSON.stringify({ error: 'Client not found or access denied' }), 
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

    // Parse session date and time with enhanced validation
    let bookingDateTime, bookingEndDateTime;
    try {
      bookingDateTime = parseISO(sessionDate);
      if (isNaN(bookingDateTime.getTime())) {
        throw new Error('Invalid date format');
      }
      bookingEndDateTime = addHours(bookingDateTime, 1); // Assuming 1-hour sessions
    } catch (dateError) {
      console.error('Date parsing error:', dateError);
      return createErrorResponse('Invalid session date format', 400, { 
        sessionDate, 
        error: dateError.message 
      });
    }

    console.log('Parsed session times:', {
      start: bookingDateTime.toISOString(),
      end: bookingEndDateTime.toISOString(),
      inputDate: sessionDate
    });

    // --- VALIDATION LOGIC ---

    // 1. Check for timeslot overlap with trainer's existing sessions (ALL clients)
    let overlappingSessions;
    try {
      const { data, error: overlapError } = await supabaseClient
        .from('sessions')
        .select('id, session_date')
        .eq('trainer_id', trainerId)
        .gte('session_date', bookingDateTime.toISOString())
        .lt('session_date', bookingEndDateTime.toISOString())
        .not('status', 'in', '("cancelled", "no-show")'); // Ignore cancelled sessions

      if (overlapError) {
        console.error('Database error checking overlaps:', overlapError);
        return createErrorResponse('Failed to check time slot availability', 500, { 
          operation: 'overlap_check',
          error: overlapError 
        });
      }
      overlappingSessions = data;
    } catch (error) {
      console.error('Unexpected error checking overlaps:', error);
      return createErrorResponse('Unexpected error checking time slot availability', 500, { 
        operation: 'overlap_check',
        error: error.message 
      });
    }

    if (overlappingSessions && overlappingSessions.length > 0) {
      console.log('Time slot overlap detected');
      return new Response(
        JSON.stringify({ error: 'Timeslot is already booked.' }), 
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Check client eligibility based on booking method
    let sessionPackId = null;
    let subscriptionId = null;
    let sessionStatus = 'scheduled'; // Default status
    let sourcePack = null;
    let sourceSubscription = null;
    let creditToUse = null;

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
          .select('id, total_sessions, sessions_remaining, service_type_id, status')
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

        // Check actual sessions used (completed + scheduled) vs total sessions
        const { data: usedSessions, error: usedSessionsError } = await supabaseClient
          .from('sessions')
          .select('id')
          .eq('session_pack_id', sourcePackId)
          .in('status', ['scheduled', 'completed']);

        if (usedSessionsError) throw usedSessionsError;
        
        const totalUsedSessions = usedSessions?.length || 0;
        const actualRemainingSessions = pack.total_sessions - totalUsedSessions;
        
        if (actualRemainingSessions <= 0) {
          return new Response(
            JSON.stringify({ error: 'No sessions remaining in pack. All sessions have been used or scheduled.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if the service type of the session matches the pack's service type
        if (pack.service_type_id !== serviceTypeId) {
          return new Response(
            JSON.stringify({ error: 'Service type does not match the selected pack.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        sessionPackId = sourcePackId;
        sourcePack = pack;
        console.log('Pack validated successfully:', pack);
        break;

      case 'subscription':
        if (!sourceSubscriptionId) {
          return new Response(
            JSON.stringify({ error: 'Subscription ID is required for subscription booking.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for weekly allocation limit and "in credit" sessions
        const { data: subscriptionDetails, error: subError } = await supabaseUserClient
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

        if (subError || !subscriptionDetails) {
          console.error('Subscription validation error:', subError);
          return new Response(
            JSON.stringify({ error: 'Invalid or inactive subscription.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if service type is allocated to subscription
        const serviceTypeExistsInSubscription = subscriptionDetails.subscription_service_allocations.some(
          (allocation: any) => allocation.service_type_id === serviceTypeId
        );
        if (!serviceTypeExistsInSubscription) {
          return new Response(
            JSON.stringify({ error: 'Selected service type is not part of this subscription.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check weekly allocation limits for subscription bookings
        const serviceTypeAllocation = subscriptionDetails.subscription_service_allocations.find(
          (allocation: any) => allocation.service_type_id === serviceTypeId
        );
        
        if (!serviceTypeAllocation) {
          return new Response(
            JSON.stringify({ error: 'Service type allocation not found for subscription.' }), 
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get current week boundaries
        const weekStart = startOfWeek(bookingDateTime, { weekStartsOn: 1 }); // Monday start
        const weekEnd = endOfWeek(bookingDateTime, { weekStartsOn: 1 });

        // Count existing sessions for this service type in the current week
        const { data: weekSessions, error: weekSessionsError } = await supabaseClient
          .from('sessions')
          .select('id')
          .eq('client_id', clientId)
          .eq('subscription_id', sourceSubscriptionId)
          .eq('service_type_id', serviceTypeId)
          .gte('session_date', weekStart.toISOString())
          .lte('session_date', weekEnd.toISOString())
          .in('status', ['scheduled', 'completed']);

        if (weekSessionsError) throw weekSessionsError;

        const sessionsThisWeek = weekSessions?.length || 0;
        if (sessionsThisWeek >= serviceTypeAllocation.quantity_per_period) {
          // Check for available credits
          const { data: availableCredits, error: creditsError } = await supabaseClient
            .from('subscription_session_credits')
            .select('id, credit_amount')
            .eq('subscription_id', sourceSubscriptionId)
            .eq('service_type_id', serviceTypeId)
            .eq('status', 'available')
            .gte('expires_at', bookingDateTime.toISOString())
            .limit(1);

          if (creditsError) throw creditsError;

          if (!availableCredits || availableCredits.length === 0) {
            return new Response(
              JSON.stringify({ error: 'Weekly session limit reached and no credits available.' }), 
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Store credit info to use after session creation
          creditToUse = availableCredits[0];
          console.log('Will use subscription credit for session:', creditToUse.id);
        }

        subscriptionId = sourceSubscriptionId;
        sourceSubscription = subscriptionDetails;
        console.log('Subscription validated successfully:', subscriptionDetails);
        break;

      case 'one-off':
        sessionStatus = 'pending_approval';
        console.log('One-off session booking, status set to pending approval');
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
        session_date: bookingDateTime.toISOString(),
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

    // Handle credit usage after session creation
    if (creditToUse && bookingMethod === 'subscription') {
      const { error: updateCreditError } = await supabaseClient
        .from('subscription_session_credits')
        .update({ 
          status: 'used',
          used_at: new Date().toISOString()
        })
        .eq('id', creditToUse.id);

      if (updateCreditError) {
        console.error('Error updating credit status:', updateCreditError);
        // Rollback session creation
        await supabaseClient.from('sessions').delete().eq('id', newSession.id);
        throw updateCreditError;
      }

      // Update session with credit metadata
      const { error: updateSessionError } = await supabaseClient
        .from('sessions')
        .update({
          is_from_credit: true,
          credit_id_consumed: creditToUse.id
        })
        .eq('id', newSession.id);

      if (updateSessionError) {
        console.error('Error updating session credit metadata:', updateSessionError);
        // Note: Don't rollback here as the core booking succeeded
      }

      console.log('Credit used successfully for session:', creditToUse.id);
    }

    // Update the source (pack remaining count) if booking from a pack - ATOMIC OPERATION
    if (bookingMethod === 'pack' && sessionPackId) {
      try {
        console.log('Attempting to decrement pack sessions:', {
          pack_id: sessionPackId,
          trainer_id: trainerId,
          expected_remaining: sourcePack.sessions_remaining
        });

        // Use SQL function for atomic decrement to prevent race conditions
        const { data: updateResult, error: decrementError } = await supabaseClient
          .rpc('decrement_pack_sessions', {
            pack_id: sessionPackId,
            trainer_id: trainerId,
            expected_remaining: sourcePack.sessions_remaining
          });

        if (decrementError) {
          console.error('Error updating pack sessions:', {
            error: decrementError,
            pack_id: sessionPackId,
            trainer_id: trainerId,
            expected_remaining: sourcePack.sessions_remaining
          });
          
          // Rollback session creation
          try {
            await supabaseClient.from('sessions').delete().eq('id', newSession.id);
            console.log('Session rollback completed for session:', newSession.id);
          } catch (rollbackError) {
            console.error('Failed to rollback session:', rollbackError);
          }
          
          if (decrementError.message?.includes('concurrent modification') || decrementError.code === 'P0001') {
            return createErrorResponse('Session pack was modified by another booking. Please try again.', 409, {
              operation: 'pack_decrement',
              pack_id: sessionPackId
            });
          }
          
          return createErrorResponse('Failed to update session pack', 500, {
            operation: 'pack_decrement',
            error: decrementError
          });
        }

        console.log('Pack sessions remaining decremented successfully:', {
          pack_id: sessionPackId,
          from: sourcePack.sessions_remaining,
          to: sourcePack.sessions_remaining - 1,
          result: updateResult
        });
      } catch (error) {
        console.error('Unexpected error during pack decrement:', error);
        return createErrorResponse('Unexpected error updating session pack', 500, {
          operation: 'pack_decrement',
          error: error.message
        });
      }
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
    console.error('Booking failed - Unhandled error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString()
    });
    
    return createErrorResponse(
      error.message || 'An unexpected error occurred during booking.',
      500,
      {
        operation: 'booking_process',
        error_type: error.name,
        timestamp: new Date().toISOString()
      }
    );
  }
});