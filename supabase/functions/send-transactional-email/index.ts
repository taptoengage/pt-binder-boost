// Deno runtime (Supabase Edge Functions)
import "jsr:@std/dotenv/load";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTMARK_SERVER_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "no-reply@optimisedtrainer.online";
const INTERNAL_FUNCTION_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ot-internal-token",
};

type Payload = {
  type: "WELCOME" | "GENERIC";
  to: string;
  data?: Record<string, unknown>;
};

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function renderHtml(payload: Payload): { subject: string; html: string } {
  if (payload.type === "WELCOME") {
    const ctaUrl = String(payload.data?.ctaUrl || "https://optimisedtrainer.online");
    return {
      subject: "Welcome to Optimised Trainer",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h1 style="margin:0 0 12px;font-size:22px;">Welcome 👋</h1>
          <p style="margin:0 0 16px;">Your account is ready. Jump back in when you're ready.</p>
          <p><a href="${ctaUrl}" style="display:inline-block;padding:12px 16px;text-decoration:none;border-radius:8px;border:1px solid #ddd;">Open Optimised Trainer</a></p>
          <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
          <p style="color:#777;font-size:12px;">Sent by Optimised Trainer</p>
        </div>
      `,
    };
  }
  const subject = String(payload.data?.subject || "Notification from Optimised Trainer");
  const body = String(payload.data?.body || "Hello from Optimised Trainer.");
  return {
    subject,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <p>${body}</p>
      </div>
    `,
  };
}

async function sendEmail(p: Payload) {
  const { subject, html } = renderHtml(p);
  const resp = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: EMAIL_FROM,
      To: p.to,
      Subject: subject,
      HtmlBody: html,
      MessageStream: "outbound",
    }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    // Postmark returns { ErrorCode, Message } on error
    throw new Error(json?.Message || resp.statusText || "Send failed");
  }
  return json; // { MessageID, To, SubmittedAt, ... }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require internal token (no service role over the wire)
  const provided = req.headers.get("x-ot-internal-token");
  if (!INTERNAL_FUNCTION_TOKEN || !provided || provided !== INTERNAL_FUNCTION_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!payload?.to || !payload?.type) {
    return new Response(JSON.stringify({ error: "Missing `to` or `type`" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (!["WELCOME", "GENERIC"].includes(payload.type)) {
    return new Response(JSON.stringify({ error: "Invalid `type`" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (!POSTMARK_SERVER_TOKEN) {
    return new Response(JSON.stringify({ error: "POSTMARK_SERVER_TOKEN not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // 1) queue log
  const { data: queued, error: qErr } = await supabaseAdmin
    .from("email_logs")
    .insert({
      email_to: payload.to,
      email_type: payload.type,
      status: "queued",
      metadata: payload.data ?? null,
    })
    .select()
    .single();

  if (qErr) {
    console.error("Queue log error:", qErr);
  }

  // 2) send with one retry
  let providerId: string | undefined;
  try {
    const first = await sendEmail(payload);
    providerId = first?.MessageID || providerId;
  } catch (e1) {
    console.warn("Send failed, retrying once:", e1);
    await new Promise((r) => setTimeout(r, 400));
    try {
      const second = await sendEmail(payload);
      providerId = second?.MessageID || providerId;
    } catch (e2) {
      await supabaseAdmin
        .from("email_logs")
        .update({ status: "failed", error: String(e2), provider_id: providerId ?? null })
        .eq("id", queued?.id);
      return new Response(JSON.stringify({ ok: false, error: String(e2) }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  // 4) log success
  await supabaseAdmin
    .from("email_logs")
    .update({ status: "sent", provider_id: providerId ?? null })
    .eq("id", queued?.id);

  return new Response(JSON.stringify({ ok: true, id: providerId ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});