import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WaitlistSignupRequest {
  email: string;
  source?: string;
  referrer?: string;
  metadata?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key for database access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: WaitlistSignupRequest = await req.json();
    console.log('DEBUG: Waitlist signup request:', { email: requestData.email, source: requestData.source });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!requestData.email || !emailRegex.test(requestData.email)) {
      return new Response(
        JSON.stringify({ error: 'Valid email address is required' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // Extract client info for analytics
    const userAgent = req.headers.get('user-agent') || '';
    const forwardedFor = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '';

    // Insert waitlist signup (using normalized_email for deduplication)
    const { data, error } = await supabaseAdmin
      .from('waitlist_signups')
      .insert({
        email: requestData.email.trim(),
        source: requestData.source || 'unknown',
        referrer: requestData.referrer || '',
        ip_address: forwardedFor,
        user_agent: userAgent,
        metadata: requestData.metadata || {},
        status: 'pending'
      })
      .select('id, email, created_at')
      .single();

    if (error) {
      console.error('Database error:', error);
      
      // Handle duplicate email gracefully
      if (error.code === '23505' && error.message?.includes('normalized_email')) {
        console.log('DEBUG: Duplicate email signup attempt:', requestData.email);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Thank you! You\'re already on our waitlist.',
            duplicate: true 
          }),
          { 
            status: 200, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to process signup' }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    console.log('DEBUG: Successful waitlist signup:', { id: data.id, email: data.email });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully added to waitlist!',
        id: data.id,
        created_at: data.created_at 
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );

  } catch (error: any) {
    console.error('Error in waitlist-signup function:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
};

serve(handler);