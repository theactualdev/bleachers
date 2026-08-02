/**
 * Waitlist signup — Supabase Edge Function (Deno).
 *
 * The browser cannot do this work itself. Writing to the table needs a key that
 * bypasses RLS, and sending the confirmation needs the Resend key; anything the
 * browser can read is public, so both have to live server-side. This function
 * is that server side, and it keeps the whole feature inside Supabase — no
 * Railway deploy involved.
 *
 * Deploy:  supabase functions deploy waitlist-signup --no-verify-jwt
 * Secrets: supabase secrets set RESEND_API_KEY=... WAITLIST_FROM="Bleachers <hello@yourdomain>"
 *
 * `--no-verify-jwt` is required: signups come from signed-out visitors.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Deliberately permissive — the confirmation email is the real validity test. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function confirmationHtml(siteUrl: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
  </head>
  <body style="margin:0;padding:0;background:#0c0a08;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      You're on the list. We'll email you the moment Bleachers opens up.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#0c0a08;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:480px;background:#15120e;border:1px solid #2b2520;border-radius:16px;">
            <tr>
              <td style="padding:32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#ffae35;border-radius:10px;width:44px;height:44px;"
                        align="center" valign="middle">
                      <span style="font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
                                   font-size:26px;font-weight:800;color:#1a1206;">B</span>
                    </td>
                  </tr>
                </table>

                <h1 style="margin:24px 0 0;font-family:'Barlow Condensed','Arial Narrow',Arial,sans-serif;
                           font-size:30px;line-height:1.15;font-weight:700;color:#f7f5f1;
                           letter-spacing:0.4px;text-transform:uppercase;">
                  You're on the list
                </h1>

                <p style="margin:14px 0 0;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;
                          font-size:15px;line-height:1.6;color:#a8a49d;">
                  Thanks for signing up to Bleachers — live stats for grassroots sport, recorded
                  from your phone in seconds.
                </p>

                <p style="margin:14px 0 0;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;
                          font-size:15px;line-height:1.6;color:#a8a49d;">
                  We're letting people in gradually. You'll get one email when it's your turn —
                  nothing else, and no forwarding your address anywhere.
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                       style="margin-top:28px;border-top:1px solid #2b2520;">
                  <tr>
                    <td style="padding-top:18px;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;
                               font-size:12px;line-height:1.5;color:#6e6a64;">
                      You received this because someone entered this address at
                      <a href="${siteUrl}" style="color:#6e6a64;">${siteUrl.replace(/^https?:\/\//, '')}</a>.
                      If that wasn't you, ignore this and you'll hear nothing further.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let email: string;
  let source: string | null = null;
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
    source = body?.source ? String(body.source).slice(0, 120) : null;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await supabase.from('waitlist_signup').insert({
    email,
    source,
    user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
  });

  // 23505 = unique violation. Signing up twice is not an error worth showing,
  // and it must not send a second email.
  const alreadyOnList = error?.code === '23505';
  if (error && !alreadyOnList) {
    console.error('waitlist insert failed', error);
    return json({ error: "Couldn't save that just now — try again." }, 500);
  }

  if (!alreadyOnList) {
    // A failed email must not fail the signup: the address is already safely
    // stored, and that is the part that actually matters.
    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('WAITLIST_FROM');
    const siteUrl = Deno.env.get('WAITLIST_SITE_URL') ?? 'https://bleacherss.vercel.app';

    if (key && from) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: email,
            subject: "You're on the Bleachers list",
            html: confirmationHtml(siteUrl),
          }),
        });
        if (!res.ok) console.error('resend failed', res.status, await res.text());
      } catch (err) {
        console.error('resend threw', err);
      }
    } else {
      console.warn('RESEND_API_KEY or WAITLIST_FROM unset — skipping confirmation email');
    }
  }

  return json({ ok: true, alreadyOnList });
});
