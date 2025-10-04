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
    // Parse request body
    let requestData;
    try {
      requestData = await req.json();
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return createErrorResponse('Invalid JSON request body', 400, { parseError: parseError.message });
    }

    const { action, ...actionData } = requestData;

    console.log('[manage-session] source', { action, source: actionData?.source || 'unknown' });
    console.log('Session management request received:', {
      action,
      actionData,
      timestamp: new Date().toISOString()
    });

    // Authenticate user
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return createErrorResponse('User not authenticated', 401, authError);
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
        return createErrorResponse('Invalid action. Supported actions: book, cancel, edit, complete, mark-no-show', 400);
    }

  } catch (error) {
    console.error('Unexpected error in manage-session:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to check user permissions for a session
async function checkSessionPermissions(sessionId: string, user: any, supabaseUserClient: any) {
  // Get client row for the user
  const { data: clientRow, error: clientErr } = await supabaseUserClient
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Fetch session details
  const { data: session, error: sessErr } = await supabaseUserClient
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessErr || !session) {
    throw new Error('Session not found or access denied');
  }

  const isTrainer = (user.id === session.trainer_id);
  const isClient = (clientRow && clientRow.id === session.client_id);

  if (!isTrainer && !isClient) {
    throw new Error('You do not have permission to access this session');
  }

  return { session, isTrainer, isClient, clientRow };
}

// BOOK SESSION HANDLER
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

  if (!clientId || !trainerId || !sessionDate || !serviceTypeId || !bookingMethod) {
    return createErrorResponse('Missing required booking data.', 400);
  }

  // Get user role from the correct 'user_roles' table
  const { data: userRole, error: roleError } = await supabaseClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError || !userRole) {
    return createErrorResponse("Could not verify user role.", 403, roleError);
  }

  let clientDataForEmail;

  // Role-based authorization using the correct tables
  if (userRole.role === 'moderator') {
    // Verify the user's UUID matches a record in the trainers table
    const { data: trainerRecord, error: trainerError } = await supabaseClient
      .from('trainers')
      .select('id, contact_email, email_notifications_enabled')
      .eq('id', user.id) // In your schema, trainers.id is the user's UUID
      .single();

    if (trainerError || !trainerRecord || trainerRecord.id !== trainerId) {
      return createErrorResponse("Trainer verification failed or mismatch.", 403);
    }

    // Verify the client being booked belongs to this trainer
    // Phase 1: Enhanced data fetching with fallbacks
    const { data: clientToBook, error: clientError } = await supabaseClient
      .from('clients')
      .select('id, email, email_notifications_enabled, name, first_name, last_name, phone_number')
      .eq('id', clientId)
      .eq('trainer_id', trainerId)
      .single();

    if (clientError || !clientToBook) {
      return createErrorResponse("Client not found or is not assigned to this trainer.", 403);
    }
    clientDataForEmail = clientToBook;

  } else if (userRole.role === 'client') {
    // Verify the client is booking for themselves
    // Phase 1: Enhanced data fetching with fallbacks
    const { data: clientRecord, error: clientError } = await supabaseClient
      .from('clients')
      .select('id, email, email_notifications_enabled, trainer_id, name, first_name, last_name, phone_number')
      .eq('user_id', user.id)
      .eq('id', clientId)
      .single();
      
    if (clientError || !clientRecord) {
        return createErrorResponse("Client verification failed.", 403);
    }
    if (clientRecord.trainer_id !== trainerId) {
        return createErrorResponse("Clients can only book with their assigned trainer.", 403);
    }
    clientDataForEmail = clientRecord;
  } else {
    return createErrorResponse("User does not have a valid role to book sessions.", 403);
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
    .select('id, session_date')
    .eq('trainer_id', trainerId)
    .gte('session_date', bookingDateTime.toISOString())
    .lt('session_date', bookingEndDateTime.toISOString())
    .not('status', 'in', '("cancelled", "no-show")');

  if (overlapError) {
    return createErrorResponse('Failed to check time slot availability', 500);
  }

  if (overlappingSessions && overlappingSessions.length > 0) {
    return createErrorResponse('Timeslot is already booked.', 409);
  }

  let sessionPackId = null;
  let subscriptionId = null;
  let sessionStatus = 'scheduled';

  switch (bookingMethod) {
    case 'pack':
      if (!sourcePackId) {
        return createErrorResponse('Pack ID is required for pack booking.', 400);
      }

      const { data: pack, error: packError } = await supabaseClient
        .from('session_packs')
        .select('id, total_sessions, service_type_id, status, sessions(id, status, cancellation_reason)')
        .eq('id', sourcePackId)
        .eq('client_id', clientId)
        .eq('trainer_id', trainerId)
        .single();

      if (packError || !pack) {
        return createErrorResponse('Invalid or inactive session pack.', 400, packError);
      }

      const totalUsedSessions = pack.sessions.filter(session =>
        ['scheduled', 'completed', 'no-show'].includes(session.status) ||
        (session.status === 'cancelled' && session.cancellation_reason === 'penalty')
      ).length;

      if (totalUsedSessions >= pack.total_sessions) {
        return createErrorResponse('No sessions remaining in pack.', 400);
      }

      if (pack.service_type_id !== serviceTypeId) {
        return createErrorResponse('Service type does not match the selected pack.', 400);
      }

      sessionPackId = sourcePackId;
      break;

    case 'subscription':
      if (!sourceSubscriptionId) {
        return createErrorResponse('Subscription ID is required for subscription booking.', 400);
      }
      subscriptionId = sourceSubscriptionId;
      break;

    case 'one-off':
      sessionStatus = 'pending_approval';
      break;

    default:
      return createErrorResponse('Invalid booking method.', 400);
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
      notes: null
    })
    .select()
    .single();

  if (insertError) {
    return createErrorResponse('Error creating session', 500, insertError);
  }

  console.log('Session created successfully:', newSession);

  // Send booking confirmation emails
  const internalToken = Deno.env.get('INTERNAL_FUNCTION_TOKEN');
  if (internalToken) {
    // Phase 1: Fetch additional data with fallbacks
    const { data: trainerRecord } = await supabaseClient
      .from('trainers')
      .select('contact_email, email_notifications_enabled, first_name, last_name, phone')
      .eq('id', trainerId)
      .single();

    // Fetch service type information
    const { data: serviceTypeRecord } = await supabaseClient
      .from('service_types')
      .select('name, description')
      .eq('id', serviceTypeId)
      .single();

    const humanDate = bookingDateTime.toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' });

    // Phase 1: Build client name with fallbacks
    const clientName = clientDataForEmail?.name || 
      (clientDataForEmail?.first_name && clientDataForEmail?.last_name 
        ? `${clientDataForEmail.first_name} ${clientDataForEmail.last_name}`.trim()
        : null) || 
      'Client';

    const clientPhone = clientDataForEmail?.phone_number || 'Not provided';
    const serviceTypeName = serviceTypeRecord?.name || 'Session';

    // Log enhanced data for verification (Phase 1 testing)
    console.log('Enhanced booking data:', {
      clientName,
      clientPhone,
      serviceTypeName,
      clientEmail: clientDataForEmail?.email
    });

    if (clientDataForEmail?.email && clientDataForEmail.email_notifications_enabled) {
      // Phase 2: Professional client email with comprehensive details (v2)
      // Determine booking method display and session details
      let sessionDetails = '';
      if (bookingMethod === 'pack' && sourcePackId) {
        // Get pack info for additional details
        const { data: packInfo } = await supabaseClient
          .from('session_packs')
          .select('sessions_remaining, total_sessions')
          .eq('id', sourcePackId)
          .single();
        
        if (packInfo) {
          sessionDetails = `${packInfo.sessions_remaining} of ${packInfo.total_sessions} sessions remaining in pack`;
        }
      } else if (bookingMethod === 'subscription' && sourceSubscriptionId) {
        sessionDetails = 'Booked from your active subscription';
      } else if (bookingMethod === 'one-off') {
        sessionDetails = 'One-off session';
      }

      await safeInvokeEmail(supabaseClient, {
        to: clientDataForEmail.email,
        type: 'CLIENT_SESSION_CONFIRMATION',
        data: {
          clientName,
          serviceTypeName,
          sessionDateTime: humanDate,
          trainerName: trainerRecord ? `${trainerRecord.first_name} ${trainerRecord.last_name}`.trim() : 'Your Trainer',
          trainerEmail: trainerRecord?.contact_email || '',
          trainerPhone: trainerRecord?.phone || '',
          bookingMethod,
          sessionDetails,
          dashboardLink: `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app') || 'https://app.lovable.app'}/client-dashboard`
        },
        internalToken
      });
    }

    if (trainerRecord?.contact_email && trainerRecord.email_notifications_enabled) {
      // Phase 3: Professional HTML email template
      // Determine booking method display and session details
      let sessionDetails = '';
      if (bookingMethod === 'pack' && sourcePackId) {
        // Get pack info for additional details
        const { data: packInfo } = await supabaseClient
          .from('session_packs')
          .select('sessions_remaining, total_sessions')
          .eq('id', sourcePackId)
          .single();
        
        if (packInfo) {
          sessionDetails = `${packInfo.sessions_remaining} of ${packInfo.total_sessions} sessions remaining in pack`;
        }
      } else if (bookingMethod === 'subscription' && sourceSubscriptionId) {
        sessionDetails = 'Booked from active subscription';
      } else if (bookingMethod === 'one-off') {
        sessionDetails = 'Pending trainer approval';
      }

      await safeInvokeEmail(supabaseClient, {
        to: trainerRecord.contact_email,
        type: 'SESSION_BOOKED',
        data: {
          clientName,
          clientPhone,
          clientEmail: clientDataForEmail?.email || 'Not provided',
          serviceTypeName,
          serviceDescription: serviceTypeRecord?.description || '',
          sessionDateTime: humanDate,
          bookingMethod,
          sessionDetails,
        },
        internalToken
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      sessionId: newSession.id,
      message: sessionStatus === 'pending_approval' ? 'Session request submitted for trainer approval.' : 'Session booked successfully!'
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

// CANCEL SESSION HANDLER
async function handleCancelSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, penalize } = requestData;

  if (!sessionId) {
    return createErrorResponse('Session ID is required', 400);
  }

  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  const now = new Date();
  const start = new Date(session.session_date);
  const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isLateCancel = hoursUntil <= 24;
  const doPenalize = penalize !== undefined ? Boolean(penalize) : isLateCancel;

  if (isLateCancel && !doPenalize && !isTrainer) {
    return createErrorResponse('Only trainers can waive penalties for late cancellations.', 403);
  }

  if (!doPenalize) {
    if (session.session_pack_id) {
      await supabaseClient.rpc('increment_pack_sessions', { pack_id: session.session_pack_id, inc: 1 });
    }
    // Restore other credit logic here if needed
  }

  const { data: updated, error: cancelErr } = await supabaseClient
    .from('sessions')
    .update({
      status: 'cancelled',
      cancellation_reason: doPenalize ? 'penalty' : 'no-penalty',
    })
    .eq('id', session.id)
    .select()
    .single();

  if (cancelErr) {
    return createErrorResponse('Failed to cancel session', 500, cancelErr);
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

  const { session } = await checkSessionPermissions(sessionId, user, supabaseUserClient);

  const now = new Date();
  const sessionStartTime = new Date(session.session_date);
  if ((sessionStartTime.getTime() - now.getTime()) / (1000 * 60 * 60) <= 24) {
    return createErrorResponse('Cannot edit session within 24 hours of its start time', 400);
  }

  const { data: updatedSession, error: updateError } = await supabaseClient
    .from('sessions')
    .update({ session_date: sessionDate, notes: notes, })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    return createErrorResponse('Failed to update session', 500, updateError);
  }

  return new Response(JSON.stringify({ success: true, updatedSession }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// COMPLETE SESSION HANDLER
async function handleCompleteSession(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, notes } = requestData;
  if (!sessionId) return createErrorResponse('Session ID is required', 400);

  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseUserClient);
  if (!isTrainer) return createErrorResponse('Only trainers can mark sessions as completed', 403);

  const { data: updatedSession, error: updateError } = await supabaseClient
    .from('sessions')
    .update({ status: 'completed', notes: notes || session.notes, })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) return createErrorResponse('Failed to complete session', 500, updateError);

  return new Response(JSON.stringify({ success: true, session: updatedSession }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// MARK NO-SHOW HANDLER
async function handleMarkNoShow(requestData: any, user: any, supabaseClient: any, supabaseUserClient: any) {
  const { sessionId, notes } = requestData;
  if (!sessionId) return createErrorResponse('Session ID is required', 400);

  const { session, isTrainer } = await checkSessionPermissions(sessionId, user, supabaseUserClient);
  if (!isTrainer) return createErrorResponse('Only trainers can mark sessions as no-show', 403);

  const { data: updatedSession, error: updateError } = await supabaseClient
    .from('sessions')
    .update({ status: 'no-show', notes: notes || session.notes, })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) return createErrorResponse('Failed to mark session as no-show', 500, updateError);

  return new Response(JSON.stringify({ success: true, session: updatedSession }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}