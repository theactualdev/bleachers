# Auth email templates

Branded replacements for Supabase's default auth emails, in the app's Floodlight-amber
language (warm charcoal canvas, amber mark, condensed wordmark).

Paste into **Supabase → Authentication → Emails → Templates**, one template per tab. Each
tab has a **Subject** field and a **Message body** field — copy the whole HTML file into
the body.

## Which templates this project actually uses

The app signs in with `signInWithOtp` (magic link) and has **no passwords at all**, which
decides what gets sent:

| Supabase template    | File                  | Used?                                                           |
| -------------------- | --------------------- | --------------------------------------------------------------- |
| **Confirm signup**   | `confirm-signup.html` | **Yes** — a _first-time_ address gets this, not Magic Link      |
| **Magic Link**       | `magic-link.html`     | **Yes** — every returning sign-in                               |
| **Invite user**      | `invite-user.html`    | Only if you call `inviteUserByEmail` (org invites in-app don't) |
| **Change Email**     | `change-email.html`   | Only once the app offers email changes                          |
| **Reset Password**   | —                     | No — there are no passwords                                     |
| **Reauthentication** | —                     | No — not used                                                   |

Getting **Confirm signup** styled matters as much as Magic Link: it's the very first email
a new user ever sees, and Supabase sends it (not the magic-link template) when the address
is new.

## Subject lines

| Template       | Subject                              |
| -------------- | ------------------------------------ |
| Confirm signup | `Confirm your email — Bleachers`     |
| Magic Link     | `Your Bleachers sign-in link`        |
| Invite user    | `You're invited to Bleachers`        |
| Change Email   | `Confirm your new email — Bleachers` |

Avoid the word "verify" in subjects where you can — it's a common spam-filter trigger.

## Template variables used

- `{{ .ConfirmationURL }}` — the action link (button + copyable fallback)
- `{{ .SiteURL }}` — your configured Site URL, used in the footer link
- `{{ .Email }}` / `{{ .NewEmail }}` — change-email only

`{{ .Token }}` (the 6-digit code) is deliberately **not** included: the app has no
code-entry screen, so showing a code nobody can use would only confuse people.

## Notes on how these are built

- **Tables and inline styles throughout.** Email clients don't do flexbox, grid, or
  `backdrop-filter`, so the app's real glass effect is approximated with a lifted panel
  (`#15120e`) and a hairline border (`#2b2520`) on the canvas (`#0c0a08`).
- **Fonts degrade gracefully.** Barlow Condensed and Inter won't load in most clients; the
  stacks fall back to Arial Narrow and system sans, which keeps the condensed/regular
  contrast intact.
- **Dark-mode hinted** via `color-scheme` meta tags so clients don't try to invert an
  already-dark email.
- **Bulletproof button** — a background-coloured table cell wrapping a padded anchor, so it
  survives Outlook.
- **Preheader text** is set per template (the grey line next to the subject in most inboxes).
- Every template repeats the raw URL under a "Button not working?" label — good for
  accessibility, and clients that strip buttons.

## After pasting

Send yourself a real one (sign in at the app) and check it on a phone. If you change the
OTP expiry in **Authentication → Providers → Email**, update the "expires in 1 hour" line
in `magic-link.html`, `confirm-signup.html`, and `change-email.html` to match.
