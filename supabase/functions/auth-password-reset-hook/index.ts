import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_FUNCTION_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN")!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // Supabase auth hooks send events with this structure
    const { user, email_data } = payload;
    
    // Only handle password recovery emails
    if (email_data.email_action_type !== 'recovery') {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Build the reset URL
    const resetUrl = `${email_data.site_url}/auth/reset?token_hash=${email_data.token_hash}&type=recovery`;
    
    // Call your custom email function
    const { data, error } = await supabaseAdmin.functions.invoke(
      'send-transactional-email',
      {
        body: {
          type: 'PASSWORD_RESET',
          to: user.email,
          data: {
            resetUrl,
            userEmail: user.email,
          }
        },
        headers: {
          'x-ot-internal-token': INTERNAL_FUNCTION_TOKEN
        }
      }
    );
    
    if (error) {
      console.error('Failed to send custom password reset email:', error);
      throw error;
    }
    
    console.log('Custom password reset email sent:', { to: user.email });
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (error) {
    console.error('Auth hook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
