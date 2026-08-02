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

RLS is on with *no policies*, so `anon` and `authenticated` can neither read nor
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
