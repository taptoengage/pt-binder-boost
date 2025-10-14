// Deno runtime (Supabase Edge Functions)
import "jsr:@std/dotenv/load";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTMARK_SERVER_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "no-reply@optimisedtrainer.online";
const INTERNAL_FUNCTION_TOKEN = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
const POSTMARK_MESSAGE_STREAM = Deno.env.get("POSTMARK_MESSAGE_STREAM") || "outbound";


type Payload = {
  type: "WELCOME" | "GENERIC" | "SESSION_BOOKED" | "CLIENT_SESSION_CONFIRMATION" | "PASSWORD_RESET";
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
  
  if (payload.type === "SESSION_BOOKED") {
    const clientName = String(payload.data?.clientName || "Client");
    const clientPhone = String(payload.data?.clientPhone || "Not provided");
    const clientEmail = String(payload.data?.clientEmail || "Not provided");
    const serviceTypeName = String(payload.data?.serviceTypeName || "Session");
    const serviceDescription = String(payload.data?.serviceDescription || "");
    const sessionDateTime = String(payload.data?.sessionDateTime || "");
    const bookingMethod = String(payload.data?.bookingMethod || "");
    const sessionDetails = String(payload.data?.sessionDetails || "");
    const dashboardUrl = "https://optimisedtrainer.online/trainer-dashboard";
    
    const bookingMethodDisplay = bookingMethod === 'pack' ? '📦 Session Pack' 
      : bookingMethod === 'subscription' ? '🔄 Subscription' 
      : '💳 One-off Session';
    
    return {
      subject: `New Session Booking: ${clientName} - ${serviceTypeName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" style="width:100%;border-collapse:collapse;border:0;border-spacing:0;background-color:#f5f5f5;">
            <tr>
              <td align="center" style="padding:40px 20px;">
                <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;border:0;border-spacing:0;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="padding:32px 32px 24px 32px;border-bottom:3px solid #0ea5e9;">
                      <h1 style="margin:0;font-size:24px;line-height:1.3;color:#0f172a;font-weight:700;">
                        🎯 New Session Booked
                      </h1>
                      <p style="margin:8px 0 0;font-size:14px;color:#64748b;">
                        A client has scheduled a session with you
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Client Information -->
                  <tr>
                    <td style="padding:24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:16px;background-color:#f8fafc;border-radius:8px;border-left:4px solid #0ea5e9;">
                            <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;font-weight:600;">
                              👤 Client Details
                            </h2>
                            <table role="presentation" style="width:100%;border-collapse:collapse;">
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Name:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0f172a;font-weight:500;">
                                  ${clientName}
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Phone:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0f172a;">
                                  ${clientPhone}
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Email:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0ea5e9;">
                                  ${clientEmail}
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Session Information -->
                  <tr>
                    <td style="padding:0 32px 24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:16px;background-color:#f0f9ff;border-radius:8px;border-left:4px solid #3b82f6;">
                            <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;font-weight:600;">
                              📅 Session Details
                            </h2>
                            <table role="presentation" style="width:100%;border-collapse:collapse;">
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Service:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0f172a;font-weight:500;">
                                  ${serviceTypeName}
                                </td>
                              </tr>
                              ${serviceDescription ? `
                              <tr>
                                <td colspan="2" style="padding:4px 0;font-size:13px;color:#64748b;">
                                  ${serviceDescription}
                                </td>
                              </tr>
                              ` : ''}
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Date & Time:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0f172a;font-weight:600;">
                                  ${sessionDateTime}
                                </td>
                              </tr>
                              <tr>
                                <td style="padding:4px 0;font-size:14px;color:#475569;">
                                  <strong style="color:#1e293b;">Booking Method:</strong>
                                </td>
                                <td style="padding:4px 0;font-size:14px;color:#0f172a;">
                                  ${bookingMethodDisplay}
                                </td>
                              </tr>
                              ${sessionDetails ? `
                              <tr>
                                <td colspan="2" style="padding:8px 0 0;font-size:13px;color:#475569;">
                                  ${sessionDetails}
                                </td>
                              </tr>
                              ` : ''}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Call to Action -->
                  <tr>
                    <td style="padding:0 32px 32px 32px;" align="center">
                      <table role="presentation" style="border-collapse:collapse;">
                        <tr>
                          <td style="border-radius:8px;background-color:#0ea5e9;">
                            <a href="${dashboardUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                              View in Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
                        Click above to manage this session and view full details
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                      <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">
                        This is an automated notification from <strong>Optimised Trainer</strong>
                      </p>
                      <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
                        © ${new Date().getFullYear()} Optimised Trainer. All rights reserved.
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
  }
  
  if (payload.type === "CLIENT_SESSION_CONFIRMATION") {
    const clientName = String(payload.data?.clientName || "there");
    const serviceTypeName = String(payload.data?.serviceTypeName || "Training Session");
    const sessionDateTime = String(payload.data?.sessionDateTime || "TBD");
    const trainerName = String(payload.data?.trainerName || "Your Trainer");
    const trainerEmail = String(payload.data?.trainerEmail || "");
    const trainerPhone = String(payload.data?.trainerPhone || "");
    const sessionDetails = String(payload.data?.sessionDetails || "");
    const dashboardUrl = "https://optimisedtrainer.online/client-dashboard";
    
    return {
      subject: `Session Confirmed: ${sessionDateTime}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" style="width:100%;border-collapse:collapse;border:0;border-spacing:0;background-color:#f5f5f5;">
            <tr>
              <td align="center" style="padding:40px 20px;">
                <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;border:0;border-spacing:0;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                  
                  <!-- Header with gradient -->
                  <tr>
                    <td style="padding:40px 32px 32px 32px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:12px 12px 0 0;">
                      <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;color:#ffffff;font-weight:700;">
                        ✅ Session Confirmed!
                      </h1>
                      <p style="margin:0;font-size:16px;color:#e0e7ff;line-height:1.5;">
                        Hi ${clientName}, your training session is all set
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Intro message -->
                  <tr>
                    <td style="padding:32px 32px 24px 32px;">
                      <p style="margin:0;font-size:16px;line-height:1.6;color:#334155;">
                        Great news! Your training session has been successfully booked. We're excited to help you achieve your fitness goals! 💪
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Session Details Card -->
                  <tr>
                    <td style="padding:0 32px 24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:24px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:10px;">
                            <h2 style="margin:0 0 16px;font-size:18px;color:#ffffff;font-weight:700;">
                              📅 Session Details
                            </h2>
                            <table role="presentation" style="width:100%;border-collapse:collapse;">
                              <tr>
                                <td colspan="2" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.2);">
                                  <div style="font-size:13px;color:#e0e7ff;margin-bottom:4px;">Date & Time</div>
                                  <div style="font-size:16px;color:#ffffff;font-weight:600;">${sessionDateTime}</div>
                                </td>
                              </tr>
                              <tr>
                                <td colspan="2" style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.2);">
                                  <div style="font-size:13px;color:#e0e7ff;margin-bottom:4px;">Service Type</div>
                                  <div style="font-size:15px;color:#ffffff;font-weight:500;">${serviceTypeName}</div>
                                </td>
                              </tr>
                              ${sessionDetails ? `
                              <tr>
                                <td colspan="2" style="padding:12px 0;">
                                  <div style="font-size:13px;color:#e0e7ff;margin-bottom:4px;">Additional Details</div>
                                  <div style="font-size:14px;color:#ffffff;line-height:1.5;">${sessionDetails}</div>
                                </td>
                              </tr>
                              ` : ''}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Trainer Information -->
                  <tr>
                    <td style="padding:0 32px 24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:20px;background-color:#f8fafc;border-radius:10px;border-left:4px solid #667eea;">
                            <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;font-weight:700;">
                              👤 Your Trainer
                            </h2>
                            <p style="margin:8px 0;font-size:15px;color:#0f172a;font-weight:600;">
                              ${trainerName}
                            </p>
                            ${trainerEmail ? `
                            <p style="margin:6px 0;font-size:14px;color:#475569;">
                              <strong style="color:#1e293b;">Email:</strong> 
                              <a href="mailto:${trainerEmail}" style="color:#667eea;text-decoration:none;">${trainerEmail}</a>
                            </p>
                            ` : ''}
                            ${trainerPhone ? `
                            <p style="margin:6px 0;font-size:14px;color:#475569;">
                              <strong style="color:#1e293b;">Phone:</strong> ${trainerPhone}
                            </p>
                            ` : ''}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Preparation Tips -->
                  <tr>
                    <td style="padding:0 32px 24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:20px;background-color:#fffbeb;border-radius:10px;border-left:4px solid #f59e0b;">
                            <h2 style="margin:0 0 12px;font-size:16px;color:#92400e;font-weight:700;">
                              💡 Preparation Tips
                            </h2>
                            <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:#78350f;">
                              <li>Arrive 5-10 minutes early to prepare</li>
                              <li>Bring water and a towel</li>
                              <li>Wear comfortable workout attire</li>
                              <li>Let your trainer know of any concerns or injuries</li>
                            </ul>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Dashboard Button -->
                  <tr>
                    <td style="padding:0 32px 32px 32px;" align="center">
                      <table role="presentation" style="border-collapse:collapse;">
                        <tr>
                          <td style="border-radius:8px;background-color:#667eea;">
                            <a href="${dashboardUrl}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                              View in Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
                        Manage your sessions and view your progress
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                      <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">
                        Need to reschedule or have questions? Contact your trainer or manage your sessions in your dashboard.
                      </p>
                      <p style="margin:8px 0 0;font-size:13px;color:#64748b;text-align:center;font-weight:600;">
                        We're excited to see you achieve your goals! 🎯
                      </p>
                      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
                        © ${new Date().getFullYear()} Optimised Trainer. All rights reserved.
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
  }
  
  if (payload.type === "PASSWORD_RESET") {
    const resetUrl = String(payload.data?.resetUrl || "");
    const userEmail = String(payload.data?.userEmail || "");
    
    return {
      subject: "Reset Your Password - Optimised Trainer",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" style="width:100%;border-collapse:collapse;border:0;border-spacing:0;background-color:#f5f5f5;">
            <tr>
              <td align="center" style="padding:40px 20px;">
                <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;border:0;border-spacing:0;background-color:#ffffff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                  
                  <!-- Header with gradient (matching client confirmation style) -->
                  <tr>
                    <td style="padding:40px 32px 32px 32px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);border-radius:12px 12px 0 0;">
                      <h1 style="margin:0 0 8px;font-size:28px;line-height:1.2;color:#ffffff;font-weight:700;">
                        🔐 Reset Your Password
                      </h1>
                      <p style="margin:0;font-size:16px;color:#e0e7ff;line-height:1.5;">
                        We received a request to reset your password
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Intro message -->
                  <tr>
                    <td style="padding:32px 32px 24px 32px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">
                        Hi there! 👋
                      </p>
                      <p style="margin:0;font-size:16px;line-height:1.6;color:#334155;">
                        Click the button below to create a new password for your Optimised Trainer account.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Reset Button -->
                  <tr>
                    <td style="padding:0 32px 32px 32px;" align="center">
                      <table role="presentation" style="border-collapse:collapse;">
                        <tr>
                          <td style="border-radius:8px;background-color:#667eea;">
                            <a href="${resetUrl}" style="display:inline-block;padding:16px 40px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                              Reset My Password →
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
                        This link will expire in 1 hour for security
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Security Notice -->
                  <tr>
                    <td style="padding:0 32px 24px 32px;">
                      <table role="presentation" style="width:100%;border-collapse:collapse;">
                        <tr>
                          <td style="padding:20px;background-color:#fffbeb;border-radius:10px;border-left:4px solid #f59e0b;">
                            <h2 style="margin:0 0 8px;font-size:15px;color:#92400e;font-weight:700;">
                              🛡️ Security Notice
                            </h2>
                            <p style="margin:0;font-size:14px;line-height:1.6;color:#78350f;">
                              If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
                      <p style="margin:0 0 8px;font-size:13px;color:#64748b;text-align:center;line-height:1.6;">
                        Need help? Contact your trainer or visit your dashboard for support.
                      </p>
                      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
                        © ${new Date().getFullYear()} Optimised Trainer. All rights reserved.
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
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
      MessageStream: POSTMARK_MESSAGE_STREAM,
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

  // Require internal token (no service role over the wire)
  const provided = req.headers.get("x-ot-internal-token");
  if (!INTERNAL_FUNCTION_TOKEN || !provided || provided !== INTERNAL_FUNCTION_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!payload?.to || !payload?.type) {
    return new Response(JSON.stringify({ error: "Missing `to` or `type`" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!["WELCOME", "GENERIC", "SESSION_BOOKED", "CLIENT_SESSION_CONFIRMATION"].includes(payload.type)) {
    return new Response(JSON.stringify({ error: "Invalid `type`" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!POSTMARK_SERVER_TOKEN) {
    return new Response(JSON.stringify({ error: "POSTMARK_SERVER_TOKEN not configured" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
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
  } else {
    console.log("[tx-email] queued", { id: queued?.id, to: payload.to, type: payload.type });
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
        {
          const targetId = queued?.id;
          if (targetId) {
            await supabaseAdmin
              .from("email_logs")
              .update({ status: "failed", error: String(e2), provider_id: providerId ?? null })
              .eq("id", targetId);
          }
        }
        return new Response(JSON.stringify({ ok: false, error: String(e2) }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
  }

  // Update to sent status with proper error handling
  const targetId = queued?.id;
  if (!targetId) {
    console.error("[tx-email] missing queued.id; cannot update to sent");
    return new Response(JSON.stringify({ ok: false, stage: "update", error: "Missing queued.id" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { error: upErr, data: upRow } = await supabaseAdmin
      .from("email_logs")
      .update({ status: "sent", provider_id: providerId ?? null })
      .eq("id", targetId)
      .select("id,status,provider_id")
      .single();

    if (upErr) {
      console.error("[tx-email] sent-status update error:", upErr);
      return new Response(JSON.stringify({ ok: false, stage: "update", error: String(upErr?.message || upErr) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("[tx-email] updated", upRow);
  } catch (updateError) {
    console.error("[tx-email] sent-status update error:", updateError);
    return new Response(JSON.stringify({ ok: false, stage: "update", error: String(updateError) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: providerId ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});