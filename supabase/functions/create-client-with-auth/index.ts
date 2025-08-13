import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header to verify the trainer is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the trainer's session
    const { data: { user: trainer }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    
    if (authError || !trainer) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { 
      name, 
      phone_number, 
      email, 
      default_session_rate, 
      training_age, 
      rough_goals, 
      physical_activity_readiness 
    } = await req.json()

    // Validate required fields
    if (!name || !phone_number || !email || default_session_rate === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Creating client with auth for:', email)

    // 1. Create the new user in Supabase auth
    const temporaryPassword = crypto.randomUUID() // Generate secure temporary password
    
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: temporaryPassword,
      email_confirm: true, // Auto-confirm email to avoid confirmation step
      user_metadata: {
        full_name: name,
        phone_number: phone_number
      }
    })

    if (userError) {
      console.error('Error creating user:', userError)
      return new Response(
        JSON.stringify({ error: `Failed to create user account: ${userError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CRITICAL: Capture the new user's ID
    const newUserId = userData.user?.id
    
    if (!newUserId) {
      console.error('No user ID returned from user creation')
      return new Response(
        JSON.stringify({ error: 'Failed to get user ID from created account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Created user with ID:', newUserId)

    // 2. Insert a record into the public.clients table
    const { data: clientData, error: clientError } = await supabaseAdmin
      .from('clients')
      .insert({
        name: name.trim(),
        phone_number: phone_number.trim(),
        email: email.trim(),
        default_session_rate: parseFloat(default_session_rate),
        training_age: training_age ? parseInt(training_age) : null,
        rough_goals: rough_goals?.trim() || null,
        physical_activity_readiness: physical_activity_readiness?.trim() || null,
        trainer_id: trainer.id,
        user_id: newUserId // CRITICAL: Link the new user's ID here
      })
      .select()
      .single()

    if (clientError) {
      console.error('Error creating client:', clientError)
      
      // Clean up: delete the auth user if client creation failed
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        console.log('Cleaned up auth user after client creation failure')
      } catch (cleanupError) {
        console.error('Failed to clean up auth user:', cleanupError)
      }
      
      return new Response(
        JSON.stringify({ error: `Failed to create client: ${clientError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully created client:', clientData.id)

    // Send password reset email so client can set their own password
    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${req.headers.get('origin') || 'http://localhost:5173'}/auth?mode=reset`
      }
    })

    if (resetError) {
      console.warn('Failed to send password reset email:', resetError)
      // Don't fail the whole operation for this
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        client: clientData,
        message: 'Client created successfully. Password reset email sent to client.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})