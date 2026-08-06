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

// Direct Postgres, deliberately not supabase-js `.from()`. This project keeps
// the Data API (PostgREST) disabled — nothing else needs it, since the API uses
// Prisma over a direct connection — and a `.from()` insert would fail against a
// project with no exposed schemas. SUPABASE_DB_URL is injected automatically.
import postgres from 'npm:postgres@3';

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
                    <td align="center" valign="middle">
                      <img src="${siteUrl}/icons/icon-192.png" width="44" height="44"
                           alt="Bleachers"
                           style="width:44px;height:44px;border-radius:10px;display:block;border:0;" />
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

/** Internal heads-up, so it stays plain and scannable rather than branded. */
function notificationHtml(signup: string, total: number, source: string | null) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="color-scheme" content="dark" /></head>
  <body style="margin:0;padding:24px;background:#0c0a08;
               font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:420px;background:#15120e;border:1px solid #2b2520;border-radius:12px;">
      <tr>
        <td style="padding:22px 24px;">
          <p style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6e6a64;">
            New waitlist signup
          </p>
          <p style="margin:10px 0 0;font-size:18px;color:#f7f5f1;font-weight:600;">${signup}</p>
          <p style="margin:14px 0 0;font-size:14px;color:#a8a49d;">
            That makes <strong style="color:#ffae35;">${total}</strong> on the list.
          </p>
          <p style="margin:6px 0 0;font-size:12px;color:#6e6a64;">Source: ${source ?? 'unknown'}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmail(
  key: string,
  payload: { from: string; to: string; subject: string; html: string },
) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error('resend failed', payload.subject, res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let email: string;
  let source: string | null = null;
  try {
    const body = await req.json();
    email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    source = body?.source ? String(body.source).slice(0, 120) : null;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return json({ error: 'Enter a valid email address.' }, 400);
  }

  // `prepare: false` — the connection may be pooled, where prepared statements
  // are not supported.
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false });

  let alreadyOnList: boolean;
  let total = 0;
  try {
    // ON CONFLICT covers the unique index on lower(email), so signing up twice
    // inserts nothing and returns no row — which is how we know not to send a
    // second confirmation. No SELECT first: that would race two simultaneous
    // signups of the same address into two emails.
    const inserted = await sql`
      insert into public.waitlist_signup (email, source, user_agent)
      values (${email}, ${source}, ${req.headers.get('user-agent')?.slice(0, 400) ?? null})
      on conflict do nothing
      returning id
    `;
    alreadyOnList = inserted.length === 0;
    // Read the running total on the same connection, before it is closed —
    // it is the one number worth having in the notification.
    if (!alreadyOnList) {
      const [row] = await sql`select count(*)::int as count from public.waitlist_signup`;
      total = row?.count ?? 0;
    }
  } catch (err) {
    console.error('waitlist insert failed', err);
    return json({ error: "Couldn't save that just now — try again." }, 500);
  } finally {
    await sql.end();
  }

  if (!alreadyOnList) {
    // A failed email must not fail the signup: the address is already safely
    // stored, and that is the part that actually matters.
    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('WAITLIST_FROM');
    // Trailing slash stripped: the logo is built as `${siteUrl}/icons/...`, and
    // a doubled slash 308-redirects, which email clients do not reliably follow.
    const siteUrl = (Deno.env.get('WAITLIST_SITE_URL') ?? 'https://bleacherss.vercel.app').replace(
      /\/+$/,
      '',
    );

    // Overridable, but defaulted so notifications work without another secret.
    const notify = Deno.env.get('WAITLIST_NOTIFY') ?? 'olayinkacodes@gmail.com';

    if (key && from) {
      try {
        // Concurrent, and allSettled: one failing send must not swallow the
        // other, and neither may fail the signup.
        await Promise.allSettled([
          sendEmail(key, {
            from,
            to: email,
            subject: "You're on the Bleachers list",
            html: confirmationHtml(siteUrl),
          }),
          sendEmail(key, {
            from,
            to: notify,
            // The address in the subject makes the inbox scannable at a glance.
            subject: `New waitlist signup — ${email}`,
            html: notificationHtml(email, total, source),
          }),
        ]);
      } catch (err) {
        console.error('resend threw', err);
      }
    } else {
      console.warn('RESEND_API_KEY or WAITLIST_FROM unset — skipping confirmation email');
    }
  }

  return json({ ok: true, alreadyOnList });
});
