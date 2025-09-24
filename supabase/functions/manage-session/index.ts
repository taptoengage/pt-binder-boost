import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addMinutes, parseISO, addHours, getDay, startOfWeek, endOfWeek } from 'https://esm.sh/date-fns@3.3.1'
import { isEmailSendingEnabled, safeInvokeEmail } from '../_shared/email.ts'

const corsHeaders = {
  'Access-control-allow-origin': '*',
  'Access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
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

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return createErrorResponse('User not authenticated', 401);
    }

    switch (action) {
      case 'book':
        return await handleBookSession(requestData, user, supabaseClient);
      case 'cancel':
        return await handleCancelSession(requestData, user, supabaseClient);
      case 'edit':
        return await handleEditSession(requestData, user, supabaseClient);
      case 'complete':
        return await handleCompleteSession(requestData, user, supabaseClient);
      case 'mark-no-show':
        return await handleMarkNoShow(requestData, user, supabaseClient);
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

  if (error || !session) throw new Error('Session not found or access denied');

  const isTrainer = user.id === session.trainers?.user_id;
  const isClient = user.id === session.clients?.user_id;

  if (!isTrainer && !isClient) throw new Error('You do not have permission to access this session');

  return { session, isTrainer, isClient };
}

async function handleBookSession(requestData: any, user: any, supabaseClient: any) {
  const { 
    clientId, trainerId, sessionDate, serviceTypeId, bookingMethod, sourcePackId, sourceSubscriptionId 
  } = requestData;

  if (!clientId || !trainerId || !sessionDate || !serviceTypeId || !bookingMethod) {
    return createErrorResponse('Missing required booking data.', 400);
  }
  
  // --- START: Rewritten Authorization and Validation Logic ---

  const { data: requesterProfile } = await supabaseClient
    .from('profiles')
    .select('id, role, trainers(id), clients(id, trainer_id)')
    .eq('id', user.id)
    .single();

  if (!requesterProfile) {
    return createErrorResponse("Could not identify the user making the request.", 401);
  }

  let clientDataForEmail;

  if (requesterProfile.role === 'trainer') {
    const trainerProfileId = requesterProfile.trainers[0]?.id;
    if (!trainerProfileId || trainerProfileId !== trainerId) {
      return createErrorResponse("Authorization failed: A trainer can only book sessions for their own profile.", 403);
    }
    
    const { data: clientToBook, error: clientError } = await supabaseClient
      .from('clients')
      .select('id, email, email_notifications_enabled')
      .eq('id', clientId)
      .eq('trainer_id', trainerId)
      .single();

    if (clientError || !clientToBook) {
      return createErrorResponse("Authorization failed: The specified client is not assigned to this trainer.", 403);
    }
    clientDataForEmail = clientToBook;

  } else if (requesterProfile.role === 'client') {
    const clientProfileId = requesterProfile.clients[0]?.id;
    const clientTrainerId = requesterProfile.clients[0]?.trainer_id;

    if (!clientProfileId || clientProfileId !== clientId) {
      return createErrorResponse("Authorization failed: A client can only book sessions for themselves.", 403);
    }
    if (clientTrainerId !== trainerId) {
      return createErrorResponse("Authorization failed: Client is not booking with their assigned trainer.", 403);
    }
    
    const { data: selfClientData, error: selfClientError } = await supabaseClient
      .from('clients')
      .select('id, email, email_notifications_enabled')
      .eq('id', clientProfileId)
      .single();

    if (selfClientError || !selfClientData) {
      return createErrorResponse("Could not find the client's profile information.", 404);
    }
    clientDataForEmail = selfClientData;
  } else {
    return createErrorResponse("Permission denied. User does not have a valid role to book sessions.", 403);
  }

  // --- END: Rewritten Authorization and Validation Logic ---

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

  if (overlapError) return createErrorResponse('Failed to check for overlapping sessions.', 500, overlapError);
  if (overlappingSessions.length > 0) return createErrorResponse('This time slot is no longer available.', 409);

  let sessionPackId = null;
  let subscriptionId = null;
  let sessionStatus = 'scheduled';

  if (bookingMethod === 'pack') {
    if (!sourcePackId) return createErrorResponse('Session pack ID is required.', 400);
    const { data: packData, error: packError } = await supabaseClient
        .from('session_packs')
        .select('*, sessions(id, status, cancellation_reason)')
        .eq('id', sourcePackId).eq('client_id', clientId).single();
    if (packError || !packData) return createErrorResponse('Invalid session pack.', 400);
    if (packData.status !== 'active') return createErrorResponse('Session pack is not active.', 400);
    if (packData.service_type_id !== serviceTypeId) return createErrorResponse('Service type does not match the pack.', 400);
    const usedSessions = packData.sessions.filter(s => ['scheduled', 'completed', 'no-show'].includes(s.status) || (s.status === 'cancelled' && s.cancellation_reason === 'penalty')).length;
    if (usedSessions >= packData.total_sessions) return createErrorResponse('No sessions remaining in this pack.', 400);
    sessionPackId = sourcePackId;
  } else if (bookingMethod === 'subscription') {
    if (!sourceSubscriptionId) return createErrorResponse('Subscription ID is required.', 400);
    subscriptionId = sourceSubscriptionId;
  } else if (bookingMethod === 'one-off') {
    sessionStatus = 'pending_approval';
  }

  const { data: newSession, error: insertError } = await supabaseClient
    .from('sessions')
    .insert({ trainer_id: trainerId, client_id: clientId, session_date: bookingDateTime.toISOString(), status: sessionStatus, service_type_id: serviceTypeId, session_pack_id: sessionPackId, subscription_id: subscriptionId })
    .select().single();

  if (insertError) return createErrorResponse('Failed to create the session.', 500, insertError);

  // --- START: Rewritten Email Notification Logic ---
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN');
  if (internalToken && clientDataForEmail) {
    const { data: trainerRecord } = await supabaseClient.from('trainers').select('contact_email, email_notifications_enabled').eq('id', trainerId).single();
    const humanDate = new Date(newSession.session_date).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' });

    // Send to Client
    if (clientDataForEmail.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, { to: clientDataForEmail.email, type: 'GENERIC', data: { subject: 'Session Confirmed!', body: `Your session with your trainer has been successfully booked for ${humanDate}.` }, internalToken });
    } else {
      console.log(`[email] Skipped for client ${clientDataForEmail.id} due to preferences.`);
    }

    // Send to Trainer
    if (trainerRecord?.contact_email && trainerRecord.email_notifications_enabled) {
      await safeInvokeEmail(supabaseClient, { to: trainerRecord.contact_email, type: 'GENERIC', data: { subject: 'New Session Booked', body: `You have a new session with a client booked for ${humanDate}.` }, internalToken });
    } else {
      console.log(`[email] Skipped for trainer ${trainerId} due to preferences or missing email.`);
    }
  }
  // --- END: Rewritten Email Notification Logic ---

  return new Response(
    JSON.stringify({ 
      success: true, 
      sessionId: newSession.id,
      message: sessionStatus === 'pending_approval' ? 'Session request submitted.' : 'Session booked successfully!'
    }), 
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleCancelSession(requestData: any, user: any, supabaseClient: any) {
  const { sessionId, penalize } = requestData;
  if (!sessionId) return createErrorResponse('Session ID is required', 400);
  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseClient);

  const now = new Date();
  const start = new Date(session.session_date);
  const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 3600);
  const isLate = hoursUntil <= 24;
  const doPenalize = penalize !== undefined ? Boolean(penalize) : isLate;

  if (isLate && !penalize && !isTrainer) {
    return createErrorResponse('Only trainers can waive late cancellation penalties.', 403);
  }

  const { error: cancelErr } = await supabaseClient.from('sessions').update({ status: 'cancelled', cancellation_reason: doPenalize ? 'penalty' : 'no-penalty' }).eq('id', sessionId);
  if (cancelErr) return createErrorResponse('Failed to cancel session.', 500, cancelErr);
  
  // Simplified credit/pack logic can be added back here if needed
  
  return new Response(JSON.stringify({ success: true, message: "Session cancelled successfully." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
}

async function handleEditSession(requestData: any, user: any, supabaseClient: any) {
  const { sessionId, sessionDate, notes } = requestData;
  if (!sessionId || !sessionDate) return createErrorResponse('Session ID and new date are required.', 400);
  const { session } = await checkSessionPermissions(sessionId, user, supabaseClient);
  
  const now = new Date();
  const sessionStartTime = new Date(session.session_date);
  if ((sessionStartTime.getTime() - now.getTime()) / (1000 * 3600) <= 24) {
    return createErrorResponse('Cannot edit a session within 24 hours of its start time.', 400);
  }
  
  const { error: updateError } = await supabaseClient.from('sessions').update({ session_date: sessionDate, notes: notes }).eq('id', sessionId);
  if (updateError) return createErrorResponse('Failed to update session.', 500, updateError);

  return new Response(JSON.stringify({ success: true, message: "Session updated successfully." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
}

async function handleCompleteSession(requestData: any, user: any, supabaseClient: any) {
    const { sessionId } = requestData;
    if (!sessionId) return createErrorResponse('Session ID is required.', 400);
    const { isTrainer } = await checkSessionPermissions(sessionId, user, supabaseClient);

    if (!isTrainer) return createErrorResponse('Only trainers can complete sessions.', 403);

    const { error } = await supabaseClient.from('sessions').update({ status: 'completed' }).eq('id', sessionId);
    if (error) return createErrorResponse('Failed to complete session.', 500, error);

    return new Response(JSON.stringify({ success: true, message: "Session marked as complete." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
}

async function handleMarkNoShow(requestData: any, user: any, supabaseClient: any) {
    const { sessionId } = requestData;
    if (!sessionId) return createErrorResponse('Session ID is required.', 400);
    const { isTrainer } = await checkSessionPermissions(sessionId, user, supabaseClient);

    if (!isTrainer) return createErrorResponse('Only trainers can mark a no-show.', 403);

    const { error } = await supabaseClient.from('sessions').update({ status: 'no-show' }).eq('id', sessionId);
    if (error) return createErrorResponse('Failed to mark session as no-show.', 500, error);

    return new Response(JSON.stringify({ success: true, message: "Session marked as no-show." }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
}