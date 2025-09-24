import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addMinutes, parseISO, addHours, getDay, startOfWeek, endOfWeek } from 'https://esm.sh/date-fns@3.3.1'
import { isEmailSendingEnabled, safeInvokeEmail } from '../_shared/email.ts'

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return createErrorResponse('Authorization header is missing', 401);
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
    const requestData = await req.json();
    const { action } = requestData;

    console.log('Session management request received:', {
      action,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return createErrorResponse('User not authenticated', 401);
    }

    // Route to appropriate action handler
    switch (action) {
      case 'book':
        return await handleBookSession(requestData, user, supabaseClient, supabaseUserClient);
      case 'cancel':
        return await handleCancelSession(requestData, user, supabaseClient, supabaseUserClient);
      case 'edit':
        return await handleEditSession(requestData, user, supabaseClient, supabaseUserClient);
      case 'complete':
        return await handleCompleteSession(requestData, user, supabaseClient, supabaseUserClient);
      case 'mark-no-show':
        return await handleMarkNoShow(requestData, user, supabaseClient, supabaseUserClient);
      default:
        return createErrorResponse('Invalid action specified', 400);
    }

  } catch (error) {
    console.error('Unexpected error in manage-session:', error);
    return createErrorResponse('Internal server error', 500, { message: error.message });
  }
});

async function checkSessionPermissions(sessionId: string, user: any, supabaseClient: any) {
  const { data: session, error } = await supabaseClient
    .from('sessions')
    .select('*, clients(user_id), trainers(user_id)')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    throw new Error('Session not found or access denied');
  }

  const isTrainer = user.id === session.trainers?.user_id;
  const isClient = user.id === session.clients?.user_id;

  if (!isTrainer && !isClient) {
    throw new Error('You do not have permission to access this session');
  }

  return { session, isTrainer, isClient };
}

async function handleBookSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { 
    clientId, 
    trainerId, 
    sessionDate, 
    serviceTypeId, 
    bookingMethod, 
    sourcePackId, 
    sourceSubscriptionId 
  } = requestData;

  // 1. Stricter validation for required fields
  if (!clientId || !trainerId || !sessionDate || !serviceTypeId || !bookingMethod) {
    return createErrorResponse('Missing required booking data.', 400);
  }
  
  // 2. More robust authorization logic
  const { data: requesterTrainerProfile, error: trainerError } = await supabaseClient
    .from('trainers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  // If the requester is not a trainer, they must be a client booking for themselves.
  if (!requesterTrainerProfile) {
      const { data: requesterClientProfile, error: clientError } = await supabaseClient
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .single();

      if (!requesterClientProfile || requesterClientProfile.id !== clientId) {
          return createErrorResponse("Permission denied. Clients can only book sessions for themselves.", 403);
      }
  } else {
    // The requester is a trainer. Verify the trainerId in the payload matches their actual profile ID.
    if (requesterTrainerProfile.id !== trainerId) {
        console.error("Authorization failed: Mismatch between requester's trainer ID and payload trainer ID.", {
            requesterTrainerId: requesterTrainerProfile.id,
            payloadTrainerId: trainerId
        });
        return createErrorResponse("A trainer can only book sessions for their own profile.", 403);
    }
  }

  // 3. Verify the client exists and is assigned to the correct trainer
  const { data: clientData, error: clientError } = await supabaseClient
    .from('clients')
    .select('id, email, email_notifications_enabled')
    .eq('id', clientId)
    .eq('trainer_id', trainerId)
    .single();

  if (clientError || !clientData) {
    console.error("Client verification failed", { clientId, trainerId, error: clientError });
    return createErrorResponse("Client not found or is not assigned to the specified trainer.", 404);
  }

  let bookingDateTime;
  try {
    bookingDateTime = parseISO(sessionDate);
    if (isNaN(bookingDateTime.getTime())) throw new Error('Invalid date');
  } catch (e) {
    return createErrorResponse('Invalid session date format.', 400);
  }
  const bookingEndDateTime = addHours(bookingDateTime, 1);

  const { data: overlappingSessions, error: overlapError } = await supabaseClient
    .from('sessions')
    .select('id')
    .eq('trainer_id', trainerId)
    .gte('session_date', bookingDateTime.toISOString())
    .lt('session_date', bookingEndDateTime.toISOString())
    .in('status', ['scheduled', 'completed']);

  if (overlapError) {
    return createErrorResponse('Failed to check for overlapping sessions.', 500, overlapError);
  }

  if (overlappingSessions.length > 0) {
    return createErrorResponse('This time slot is no longer available.', 409);
  }

  let sessionPackId = null;
  let subscriptionId = null;
  let sessionStatus = 'scheduled';

  if (bookingMethod === 'pack') {
    if (!sourcePackId) return createErrorResponse('Session pack ID is required.', 400);
    
    const { data: packData, error: packError } = await supabaseClient
        .from('session_packs')
        .select('*, sessions(id, status, cancellation_reason)')
        .eq('id', sourcePackId)
        .eq('client_id', clientId)
        .single();

    if (packError || !packData) return createErrorResponse('Invalid session pack.', 400);
    if (packData.status !== 'active') return createErrorResponse('Session pack is not active.', 400);
    if (packData.service_type_id !== serviceTypeId) return createErrorResponse('Service type does not match the pack.', 400);

    const usedSessions = packData.sessions.filter(s => 
        ['scheduled', 'completed', 'no-show'].includes(s.status) || 
        (s.status === 'cancelled' && s.cancellation_reason === 'penalty')
    ).length;

    if (usedSessions >= packData.total_sessions) {
        return createErrorResponse('No sessions remaining in this pack.', 400);
    }
    sessionPackId = sourcePackId;
  } else if (bookingMethod === 'subscription') {
      if (!sourceSubscriptionId) return createErrorResponse('Subscription ID is required.', 400);
      subscriptionId = sourceSubscriptionId;
  } else if (bookingMethod === 'one-off') {
      sessionStatus = 'pending_approval';
  }

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
    })
    .select()
    .single();

  if (insertError) {
    return createErrorResponse('Failed to create the session.', 500, insertError);
  }

  // Handle email notifications...

  return new Response(
    JSON.stringify({ 
      success: true, 
      sessionId: newSession.id,
      message: sessionStatus === 'pending_approval' 
        ? 'Session request submitted for approval.' 
        : 'Session booked successfully!'
    }), 
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

// ... (handleCancelSession, handleEditSession, etc. remain the same)
// CANCEL SESSION HANDLER
async function handleCancelSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, penalize } = requestData;
  
  console.log(`DEBUG: Raw 'penalize' received:`, penalize);
  console.log(`DEBUG: SessionId received:`, sessionId);
  
  if (!sessionId) {
    return createErrorResponse('Session ID is required', 400);
  }

  const { session, isTrainer, isClient } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  // Determine penalty logic
  let doPenalize;
  if (penalize !== undefined) {
    doPenalize = Boolean(penalize);
  } else {
    const now = new Date();
    const start = new Date(session.session_date);
    const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
    doPenalize = hoursUntil <= 24;
  }

  // Enforce trainer-only penalty waiver
  const now = new Date();
  const start = new Date(session.session_date);
  const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isLateCancel = hoursUntil <= 24;

  if (isLateCancel && doPenalize === false && !isTrainer) {
    return createErrorResponse('Permission denied: Only trainers can waive penalties for late cancellations.', 403);
  }

  console.log(`Processing cancellation for session ${sessionId}, penalize: ${doPenalize}`);

  // Process refunds/credits if no penalty
  if (!doPenalize) {
    console.log('Non-penalty cancellation: processing refunds/credits');
    
    // If from pack, increment sessions_remaining back by 1
    if (session.session_pack_id) {
      try {
        const { data: incResult, error: rpcErr } = await supabaseClient
          .rpc('increment_pack_sessions', {
            pack_id: session.session_pack_id,
            trainer_id: session.trainer_id,
            inc: 1,
          });
        if (rpcErr) {
          console.error('RPC increment_pack_sessions error:', rpcErr);
        } else {
          console.log('increment_pack_sessions succeeded:', incResult);
        }
      } catch (e) {
        console.error('Unexpected error calling increment_pack_sessions:', e);
      }
    }

    // If from subscription, handle credits
    if (session.subscription_id) {
      if (session.is_from_credit && session.credit_id_consumed) {
        // Revert used credit
        const { error: creditRevertErr } = await supabaseClient
          .from('subscription_session_credits')
          .update({ status: 'available', used_at: null })
          .eq('id', session.credit_id_consumed);
        if (creditRevertErr) {
          console.error('Error reverting used credit:', creditRevertErr);
        } else {
          console.log('Successfully reverted consumed credit:', session.credit_id_consumed);
        }
      } else {
        // Create new credit
        let creditValue = 0;
        const { data: allocation, error: allocErr } = await supabaseClient
          .from('subscription_service_allocations')
          .select('cost_per_session')
          .eq('subscription_id', session.subscription_id)
          .eq('service_type_id', session.service_type_id)
          .maybeSingle();
        if (!allocErr && allocation?.cost_per_session != null) {
          creditValue = Number(allocation.cost_per_session);
        }

        const { error: insertCreditErr } = await supabaseClient
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
  }

  // Mark session as cancelled
  const cancellationReason = doPenalize ? 'penalty' : 'no-penalty';
  
  const { data: updated, error: cancelErr } = await supabaseClient
    .from('sessions')
    .update({ 
      status: 'cancelled', 
      cancellation_reason: cancellationReason,
      updated_at: new Date().toISOString() 
    })
    .eq('id', session.id)
    .select()
    .single();

  if (cancelErr) {
    console.error('Error cancelling session:', cancelErr);
    return createErrorResponse('Failed to cancel session', 500);
  }

  // Send cancellation notification emails
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN');
  if (internalToken) {
    // Fetch client and trainer emails with preferences
    const { data: clientRow } = await supabaseClient
      .from('clients')
      .select('email, email_notifications_enabled')
      .eq('id', session.client_id)
      .single();
    const { data: trainerRow } = await supabaseClient
      .from('trainers')
      .select('contact_email, email_notifications_enabled')
      .eq('id', session.trainer_id)
      .single();

    // Human-readable session date
    const sessionDateReadable = new Date(session.session_date)
      .toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

    // Craft email content
    const subject = 'Session cancelled';
    let body = `Your session on ${sessionDateReadable} has been cancelled.`;
    if (doPenalize) {
      body += ' A penalty applies.';
    } else {
      body += ' No penalty will be charged.';
    }

    // Send email to client if opted in
    if (clientRow?.email && clientRow?.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, {
        to: clientRow.email,
        type: 'GENERIC',
        data: { subject, body },
        internalToken
      });
    } else if (clientRow?.email) {
      console.log('[email] skipped - recipient opted out', { recipientType: 'client', sessionId: session.id });
    }

    // Send email to trainer if opted in
    if (trainerRow?.contact_email && trainerRow?.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, {
        to: trainerRow.contact_email,
        type: 'GENERIC',
        data: { subject, body },
        internalToken
      });
    } else if (trainerRow?.contact_email) {
      console.log('[email] skipped - recipient opted out', { recipientType: 'trainer', sessionId: session.id });
    }
  }

  return new Response(JSON.stringify({ success: true, session: updated }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// EDIT SESSION HANDLER
async function handleEditSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, sessionDate, notes } = requestData;

  if (!sessionId || !sessionDate) {
    return createErrorResponse('Session ID and date are required', 400);
  }

  console.log('Edit session request:', { sessionId, sessionDate, notes });

  const { session, isTrainer, isClient } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  // Store original session date for reschedule notification
  const previousDate = session.session_date;

  // Check 24-hour policy
  const now = new Date();
  const sessionStartTime = new Date(session.session_date);
  const hoursUntilSession = (sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilSession <= 24) {
    console.log('24-hour policy violation:', { hoursUntilSession });
    return createErrorResponse('Cannot edit session within 24 hours of its start time', 400);
  }

  // Check for overlapping sessions for this trainer (1-hour duration)
  const proposedStart = new Date(sessionDate);
  const proposedEnd = new Date(proposedStart.getTime() + 60 * 60 * 1000);

  const { data: possibleOverlaps, error: overlapError } = await supabaseUserClient
    .from('sessions')
    .select('id, session_date, status')
    .eq('trainer_id', session.trainer_id)
    .neq('id', sessionId)
    .in('status', ['scheduled', 'completed']);

  if (overlapError) {
    console.error('Overlap check error:', overlapError);
    return createErrorResponse('Failed to validate timeslot', 500);
  }

  const hasOverlap = (possibleOverlaps || []).some((s: any) => {
    const start = new Date(s.session_date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return proposedStart < end && proposedEnd > start;
  });

  if (hasOverlap) {
    return createErrorResponse('This timeslot overlaps with another session.', 409);
  }

  // Update the session
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
    return createErrorResponse('Failed to update session', 500);
  }

  console.log('Session updated successfully:', updatedSession);

  // Send reschedule notification emails
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN');
  if (internalToken) {
    // Fetch client and trainer emails with preferences
    const { data: clientRow } = await supabaseClient
      .from('clients')
      .select('email, email_notifications_enabled')
      .eq('id', session.client_id)
      .single();
    const { data: trainerRow } = await supabaseClient
      .from('trainers')
      .select('contact_email, email_notifications_enabled')
      .eq('id', session.trainer_id)
      .single();

    // Human-readable dates
    const oldDateReadable = new Date(previousDate)
      .toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });
    const newDateReadable = new Date(sessionDate)
      .toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

    // Craft email content
    const subject = 'Session rescheduled';
    const body = `Your session originally set for ${oldDateReadable} has been rescheduled to ${newDateReadable}.`;

    // Send email to client if opted in
    if (clientRow?.email && clientRow?.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, {
        to: clientRow.email,
        type: 'GENERIC',
        data: { subject, body },
        internalToken
      });
    } else if (clientRow?.email) {
      console.log('[email] skipped - recipient opted out', { recipientType: 'client', sessionId: session.id });
    }

    // Send email to trainer if opted in
    if (trainerRow?.contact_email && trainerRow?.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, {
        to: trainerRow.contact_email,
        type: 'GENERIC',
        data: { subject, body },
        internalToken
      });
    } else if (trainerRow?.contact_email) {
      console.log('[email] skipped - recipient opted out', { recipientType: 'trainer', sessionId: session.id });
    }
  }

  return new Response(JSON.stringify({ success: true, updatedSession }), { 
    status: 200, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// COMPLETE SESSION HANDLER
async function handleCompleteSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, notes } = requestData;

  if (!sessionId) {
    return createErrorResponse('Session ID is required', 400);
  }

  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  // Only trainers can mark sessions as completed
  if (!isTrainer) {
    return createErrorResponse('Only trainers can mark sessions as completed', 403);
  }

  // Update session status to completed
  const { data: updatedSession, error: updateError } = await supabaseClient
    .from('sessions')
    .update({
      status: 'completed',
      notes: notes || session.notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    console.error('Session completion error:', updateError);
    return createErrorResponse('Failed to complete session', 500);
  }

  console.log('Session completed successfully:', updatedSession);

  return new Response(JSON.stringify({ success: true, session: updatedSession }), { 
    status: 200, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// MARK NO-SHOW HANDLER
async function handleMarkNoShow(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, notes } = requestData;

  if (!sessionId) {
    return createErrorResponse('Session ID is required', 400);
  }

  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  // Only trainers can mark sessions as no-show
  if (!isTrainer) {
    return createErrorResponse('Only trainers can mark sessions as no-show', 403);
  }

  // Update session status to no-show
  const { data: updatedSession, error: updateError } = await supabaseClient
    .from('sessions')
    .update({
      status: 'no-show',
      notes: notes || session.notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    console.error('Session no-show error:', updateError);
    return createErrorResponse('Failed to mark session as no-show', 500);
  }

  console.log('Session marked as no-show successfully:', updatedSession);

  return new Response(JSON.stringify({ success: true, session: updatedSession }), { 
    status: 200, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}