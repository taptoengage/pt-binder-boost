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

  try {
    // Create Supabase client with service role key for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create regular client for trainer authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Authenticate the trainer
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { clientId } = await req.json();
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log(`DEBUG: Starting deletion process for client: ${clientId}, trainer: ${user.id}`);

    // First, get the client record to verify ownership and get user_id
    const { data: client, error: clientLookupError } = await supabaseAdmin
      .from('clients')
      .select('id, user_id, trainer_id, name, email')
      .eq('id', clientId)
      .eq('trainer_id', user.id) // Verify trainer owns this client
      .single();

    if (clientLookupError || !client) {
      console.error('Client lookup error:', clientLookupError);
      return new Response(
        JSON.stringify({ error: 'Client not found or access denied' }),
        { status: 404, headers: corsHeaders }
      );
    }

    console.log(`DEBUG: Found client: ${client.name} (${client.email}), user_id: ${client.user_id}`);

    // Start atomic deletion process
    try {
      // Step 1: Delete all associated data in proper order (due to foreign key constraints)
      
      // Fetch subscription IDs for this client first to avoid .in() subquery errors
      const { data: subscriptionRows, error: subIdsError } = await supabaseAdmin
        .from('client_subscriptions')
        .select('id')
        .eq('client_id', clientId);

      if (subIdsError) {
        console.error('Error fetching subscription IDs:', subIdsError);
      }
      const subscriptionIds = (subscriptionRows ?? []).map((s: { id: string }) => s.id);

      if (subscriptionIds.length > 0) {
        // Delete subscription session credits
        const { error: creditsError } = await supabaseAdmin
          .from('subscription_session_credits')
          .delete()
          .in('subscription_id', subscriptionIds);
        if (creditsError) {
          console.error('Error deleting subscription session credits:', creditsError);
        }

        // Delete subscription service allocations
        const { error: allocationsError } = await supabaseAdmin
          .from('subscription_service_allocations')
          .delete()
          .in('subscription_id', subscriptionIds);
        if (allocationsError) {
          console.error('Error deleting subscription service allocations:', allocationsError);
        }

        // Delete subscription billing periods
        const { error: billingError } = await supabaseAdmin
          .from('subscription_billing_periods')
          .delete()
          .in('client_subscription_id', subscriptionIds);
        if (billingError) {
          console.error('Error deleting billing periods:', billingError);
        }
      } else {
        console.log('INFO: No subscriptions found for client; skipping subscription-related deletions');
      }

      // Delete client subscriptions
      const { error: subscriptionsError } = await supabaseAdmin
        .from('client_subscriptions')
        .delete()
        .eq('client_id', clientId);
      
      if (subscriptionsError) {
        console.error('Error deleting client subscriptions:', subscriptionsError);
      }

      // Delete sessions
      const { error: sessionsError } = await supabaseAdmin
        .from('sessions')
        .delete()
        .eq('client_id', clientId);
      
      if (sessionsError) {
        console.error('Error deleting sessions:', sessionsError);
      }

      // Delete session packs
      const { error: packsError } = await supabaseAdmin
        .from('session_packs')
        .delete()
        .eq('client_id', clientId);
      
      if (packsError) {
        console.error('Error deleting session packs:', packsError);
      }

      // Delete payments
      const { error: paymentsError } = await supabaseAdmin
        .from('payments')
        .delete()
        .eq('client_id', clientId);
      
      if (paymentsError) {
        console.error('Error deleting payments:', paymentsError);
      }

      // Delete client service rates
      const { error: ratesError } = await supabaseAdmin
        .from('client_service_rates')
        .delete()
        .eq('client_id', clientId);
      
      if (ratesError) {
        console.error('Error deleting client service rates:', ratesError);
      }

      // Step 2: Delete the client record
      const { error: clientDeleteError } = await supabaseAdmin
        .from('clients')
        .delete()
        .eq('id', clientId)
        .eq('trainer_id', user.id); // Double-check ownership

      if (clientDeleteError) {
        throw new Error(`Failed to delete client record: ${clientDeleteError.message}`);
      }

      // Step 3: Delete the auth user (if user_id exists)
      if (client.user_id) {
        console.log(`DEBUG: Deleting auth user: ${client.user_id}`);
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(client.user_id);
        
        if (authDeleteError) {
          console.error('Error deleting auth user:', authDeleteError);
          // Don't throw here - client data is already deleted, log the issue
          console.warn(`WARNING: Client data deleted but auth user ${client.user_id} could not be deleted: ${authDeleteError.message}`);
        } else {
          console.log(`SUCCESS: Auth user ${client.user_id} deleted successfully`);
        }
      } else {
        console.log('INFO: No user_id found for client, skipping auth user deletion');
      }

      console.log(`SUCCESS: Client ${client.name} (${clientId}) and all associated data deleted successfully`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Client ${client.name} and all associated data have been permanently deleted.` 
        }),
        { status: 200, headers: corsHeaders }
      );

    } catch (error) {
      console.error('Error during deletion process:', error);
      return new Response(
        JSON.stringify({ error: `Deletion failed: ${error.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});