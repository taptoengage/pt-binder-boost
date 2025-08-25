
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WaitlistSignupRequest {
  email: string;
  source?: string;
  referrer?: string;
  metadata?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with anon key; the RPC is SECURITY DEFINER
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const requestData: WaitlistSignupRequest = await req.json();
    console.log("DEBUG: Waitlist signup request:", {
      email: requestData.email,
      source: requestData.source,
    });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!requestData.email || !emailRegex.test(requestData.email)) {
      return new Response(
        JSON.stringify({ error: "Valid email address is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Extract client info for analytics
    const userAgent = req.headers.get("user-agent") || "";
    const forwardedFor =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("cf-connecting-ip") ||
      "";

    // Call the SECURITY DEFINER RPC that gracefully handles duplicates
    const { data, error } = await supabase.rpc("add_to_waitlist", {
      p_email: requestData.email.trim(),
      p_source: requestData.source ?? "unknown",
      p_referrer: requestData.referrer ?? "",
      p_metadata: requestData.metadata ?? {},
      p_ip_address: forwardedFor,
      p_user_agent: userAgent,
    });

    if (error) {
      console.error("RPC error in add_to_waitlist:", error);
      // If the DB function raised an error (e.g., invalid input), surface a clean message
      return new Response(
        JSON.stringify({ error: "Failed to process signup" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // The RPC RETURNS TABLE, so Supabase returns an array; take the first row
    const row = Array.isArray(data) ? data[0] : data;
    console.log("DEBUG: add_to_waitlist RPC returned:", row);

    if (!row?.id) {
      console.error("Unexpected RPC response shape:", data);
      return new Response(
        JSON.stringify({ error: "Unexpected response from server" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Build a friendly response
    const responseBody = {
      success: true,
      message: row.duplicate
        ? "Thank you! You're already on our waitlist."
        : "Successfully added to waitlist!",
      id: row.id,
      created_at: row.created_at,
      duplicate: !!row.duplicate,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in waitlist-signup function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
