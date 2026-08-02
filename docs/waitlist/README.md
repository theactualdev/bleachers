# Waitlist

A public signup page at `/waitlist` that stores addresses in Supabase and sends a
branded confirmation via Resend.

## Why it isn't a direct browser insert

The original plan was for the page to write straight to a Supabase table. That
can't send a confirmation email: the Resend API key would have to reach the
browser, and anything the browser can read is public — `NEXT_PUBLIC_*` values
are visible to every visitor.

So the page calls the **`waitlist-signup` edge function** instead, which holds
both the service-role key and the Resend key server-side. The footprint stays
entirely inside Supabase — no Railway deploy — which was the point of choosing
the browser-direct approach in the first place.

## Setup

**1. Create the table.** Supabase → SQL Editor → run [`schema.sql`](schema.sql).

RLS is on with _no policies_, so `anon` and `authenticated` can neither read nor
write it through PostgREST. Only the edge function touches it. That matters: a
waitlist is a list of email addresses, and any policy permissive enough for
anonymous inserts is easy to get wrong in a way that leaks the list.

**2. Deploy the function.**

```bash
supabase functions deploy waitlist-signup --no-verify-jwt
```

`--no-verify-jwt` is required — signups come from signed-out visitors, so there
is no JWT to verify. You can also paste the function body in the dashboard under
Edge Functions if you'd rather not install the CLI.

**3. Set its secrets.**

```bash
supabase secrets set RESEND_API_KEY=re_xxx WAITLIST_FROM="Bleachers <hello@yourdomain.com>" WAITLIST_SITE_URL=https://bleacherss.vercel.app
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set those yourself.

The `WAITLIST_FROM` address must be on a domain you've verified in Resend.
Resend will reject an unverified sender, and until you verify one you can only
send to your own address.

If `RESEND_API_KEY` or `WAITLIST_FROM` is missing the signup still succeeds and
the email is skipped, with a warning in the function logs. Losing the
confirmation is a nuisance; losing the address is not recoverable.

## Making the waitlist the front door

Off by default. To turn it on, set in Vercel and redeploy:

```
NEXT_PUBLIC_WAITLIST_MODE=on
```

Signed-out visitors hitting any app page then land on `/waitlist` instead of
`/login`. `/login` is never blocked, only unlinked — it stays reachable by
direct URL, which is your way in. Remove the variable to go back to normal.

`NEXT_PUBLIC_*` is inlined at build time, so this needs a redeploy, not just a
variable change.

## Pre-launch lockdown: one account, no signups

Hiding the login link is not a lock. Three things make it one, and **the first
two are the ones that actually hold** — the third is only presentation.

**1. Stop Supabase creating accounts.** Authentication → Sign In / Providers →
Email → turn **off** "Allow new users to sign up".

This is the load-bearing setting. Until it's off, anyone who reaches `/login`
gets an account: `signInWithOtp` creates a user for an unknown address by
default, which is how the app behaved before this change. Being a project-level
setting it also covers Google and any provider added later, which a client-side
check never could.

**2. Allowlist your address on the API.** On Railway:

```
ALLOWED_EMAILS=olayinkacodes@gmail.com
```

Comma-separated for more than one. The auth guard rejects any other verified
session with `403 Bleachers is not open yet.`, so even a valid Supabase token
cannot read or write your data. Leave it unset and the API is open to any valid
session — that's the default, so local dev and CI are unaffected.

Why both: the anon key is public and ships in the browser bundle. Anyone can
call Supabase's auth endpoints directly with whatever options they like, so
nothing enforced in the web app is enforcement at all. Step 1 stops the account
existing; step 2 stops a session mattering if one somehow does.

**3. The sign-in form asks for no new accounts.** `shouldCreateUser: false`, and
an unknown address gets pointed at the waitlist rather than a raw Supabase
error. Cosmetic — a caller who skips the form skips this too.

To open up later: turn signups back on, and remove `ALLOWED_EMAILS`.

## Checking signups

```sql
select count(*) from public.waitlist_signup;
select email, created_at from public.waitlist_signup order by created_at desc;
```

## Not included

- **Rate limiting.** Anyone can POST addresses to the function. Duplicates are
  rejected by a unique index and never re-emailed, but a determined script could
  still enumerate signups. Supabase can rate-limit at the gateway, or add a
  captcha if it becomes a problem.
- **Unsubscribe.** Fine for a one-off launch email; needed if it becomes a list
  you mail repeatedly.
