'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, ArrowRight } from 'lucide-react';
import { fetchEnabledProviders, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CodeInput } from '@/components/ui/code-input';
import { Input, Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { API_URL } from '@/lib/api';

/**
 * Digits in the emailed sign-in code. Must match Supabase's OTP length
 * (Authentication → Providers → Email → "Email OTP Length").
 */
const CODE_LENGTH = 6;

function LoginInner() {
  const rawNext = useSearchParams().get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [googlePending, setGooglePending] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const router = useRouter();

  // Countdown for the resend cooldown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Only offer Google once we know the project has it configured (see
  // fetchEnabledProviders: an unconfigured provider strands the user on a JSON
  // error page rather than failing client-side).
  useEffect(() => {
    let active = true;
    fetchEnabledProviders()
      .then((providers) => {
        if (active) setGoogleEnabled(providers.google === true);
      })
      .catch(() => {
        /* Leave the button hidden; the magic link always works. */
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * `resend` keeps the code screen up while a new code is fetched — flipping
   * `status` back to 'sending' would bounce the user to the email form.
   */
  async function requestCode({ resend = false } = {}) {
    if (resend) setResending(true);
    else setStatus('sending');
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${next}`,
        // Never create an account from the sign-in form. This is UX, not
        // security — Supabase's "Allow new users to sign up" setting is what
        // actually enforces it, since the anon key is public and a caller can
        // send whatever options they like.
        shouldCreateUser: false,
      },
    });
    if (resend) setResending(false);
    if (error) {
      if (!resend) setStatus('error');
      setError(
        /signups? not allowed|otp_disabled|not found/i.test(error.message ?? '')
          ? 'NOT_OPEN'
          : (error.message ?? 'Could not send the code'),
      );
      return;
    }
    setStatus('sent');
    // Supabase rate-limits sends; hold the resend for a moment so a second tap
    // doesn't earn a "too many requests" instead of an email.
    setResendIn(30);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    await requestCode();
  }

  /**
   * Verify the emailed code in-place.
   *
   * This is the path that works when the app is installed to the home screen:
   * tapping the emailed link opens the system browser, whose storage is separate
   * from the standalone PWA (strictly so on iOS), so the session would land in
   * the wrong place. Typing the code signs you in right here instead.
   */
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError('');
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      // 'email' covers both a first-time signup code and a returning sign-in code.
      type: 'email',
    });
    setVerifying(false);
    if (error) {
      setError(
        /expired|invalid/i.test(error.message)
          ? 'That code is wrong or has expired. Request a new one below.'
          : (error.message ?? 'Could not verify that code'),
      );
      return;
    }
    router.replace(next);
  }

  /**
   * `signInWithOAuth` resolves with an `error` rather than throwing (and only
   * redirects on success), so an unconfigured provider fails silently unless we
   * check it. Surface it instead of leaving the button looking dead.
   */
  async function signInWithGoogle() {
    setGooglePending(true);
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (error) {
      setGooglePending(false);
      setError(
        /not enabled|unsupported provider/i.test(error.message)
          ? 'Google sign-in isn’t available yet — use the magic link above.'
          : (error.message ?? 'Could not start Google sign-in'),
      );
    }
    // On success the browser navigates to Google; leave the button busy.
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 p-6">
      <div className="text-center">
        <div className="bg-brand text-brand-ink font-display shadow-button mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-4xl font-extrabold">
          B
        </div>
        <h1 className="font-display text-ink-1 text-3xl font-bold uppercase tracking-tight">
          Bleachers
        </h1>
        <p className="text-ink-2 mt-1 text-sm">Score any match in seconds.</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          {status === 'sent' ? (
            <motion.form
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onSubmit={verifyCode}
              className="space-y-4"
            >
              <div className="text-center">
                <div className="glass mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
                  <Mail className="text-brand h-6 w-6" />
                </div>
                <p className="font-display text-ink-1 mt-4 text-2xl font-bold tracking-tight">
                  Check your email
                </p>
                <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                  We sent a sign-in code to
                  <br />
                  <span className="text-ink-1 font-medium">{email}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-eyebrow text-ink-3 block text-center">
                  Enter the code
                </Label>
                <CodeInput
                  id="code"
                  value={code}
                  onChange={setCode}
                  length={CODE_LENGTH}
                  autoFocus
                  disabled={verifying}
                />
              </div>

              {error && <p className="text-negative text-center text-sm">{error}</p>}

              <Button
                type="submit"
                className="w-full"
                disabled={verifying || code.length < CODE_LENGTH}
              >
                {verifying ? <Spinner /> : <ArrowRight className="h-4 w-4" />}
                Sign in
              </Button>

              <div className="flex items-center justify-center gap-1 text-xs">
                <span className="text-ink-3">Didn't get it?</span>
                <button
                  type="button"
                  disabled={resendIn > 0 || resending}
                  onClick={() => void requestCode({ resend: true })}
                  className="text-brand font-medium disabled:opacity-50"
                >
                  {resending
                    ? 'Sending…'
                    : resendIn > 0
                      ? `Resend in ${resendIn}s`
                      : 'Send a new code'}
                </button>
              </div>

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStatus('idle');
                  setCode('');
                  setError('');
                }}
              >
                Use a different email
              </Button>
            </motion.form>
          ) : (
            <form onSubmit={submitEmail} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error === 'NOT_OPEN' ? (
                <p className="text-ink-2 text-sm leading-relaxed">
                  Bleachers isn't open to new accounts yet.{' '}
                  <Link href="/waitlist" className="text-brand font-medium">
                    Join the waitlist
                  </Link>{' '}
                  and we'll email you when it's your turn.
                </p>
              ) : (
                error && <p className="text-negative text-sm">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? <Spinner /> : <Mail className="h-4 w-4" />}
                Email me a sign-in code
              </Button>
              {googleEnabled && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    <span className="bg-hairline h-px flex-1" />
                    <span className="text-ink-3 text-eyebrow">or</span>
                    <span className="bg-hairline h-px flex-1" />
                  </div>
                  <Button
                    type="button"
                    variant="glass"
                    className="w-full"
                    disabled={googlePending}
                    onClick={() => void signInWithGoogle()}
                  >
                    {googlePending && <Spinner />}
                    Continue with Google
                  </Button>
                </>
              )}
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-ink-3 text-[11px]">API: {API_URL}</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
