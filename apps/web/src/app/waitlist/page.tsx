'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Logo } from '@/components/ui/logo';
import { Spinner } from '@/components/ui/misc';

/**
 * Public waitlist. Deliberately not wrapped in AuthGate — signed-out visitors
 * are the entire audience.
 *
 * Posts to the `waitlist-signup` edge function rather than inserting into the
 * table directly: the insert needs a service-role key and the confirmation
 * email needs the Resend key, and neither can be exposed to the browser.
 */
export default function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');

    const { data, error: fnError } = await supabase.functions.invoke<{
      ok: boolean;
      alreadyOnList: boolean;
      error?: string;
    }>('waitlist-signup', { body: { email: email.trim(), source: 'web' } });

    if (fnError || !data?.ok) {
      setStatus('idle');
      setError(data?.error ?? "Couldn't sign you up just now — try again in a moment.");
      return;
    }

    setAlreadyOnList(data.alreadyOnList);
    setStatus('done');
  }

  return (
    // A <div>, not <main>: the root layout already renders the page's <main>,
    // and nesting a second one is invalid and confuses screen readers.
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <Logo size={56} className="mx-auto" priority />
        <h1 className="font-display text-ink-1 mt-4 text-3xl font-bold uppercase tracking-tight">
          Bleachers
        </h1>
        <p className="text-ink-2 mt-1 text-sm">Score any match in seconds.</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          {status === 'done' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 text-center"
            >
              <div className="glass mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
                <Check className="text-brand h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-ink-1 text-2xl font-bold tracking-tight">
                  {alreadyOnList ? "You're already on it" : "You're on the list"}
                </p>
                <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                  {alreadyOnList ? (
                    <>
                      We already have <span className="text-ink-1 font-medium">{email}</span> — no
                      need to sign up twice.
                    </>
                  ) : (
                    <>
                      We sent a confirmation to
                      <br />
                      <span className="text-ink-1 font-medium">{email}</span>
                    </>
                  )}
                </p>
              </div>
              <p className="text-ink-3 text-xs leading-relaxed">
                We'll email you once when it's your turn. Nothing else, and we won't pass your
                address on.
              </p>
            </motion.div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="text-center">
                <div className="glass mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
                  <Mail className="text-brand h-6 w-6" />
                </div>
                <p className="font-display text-ink-1 mt-4 text-2xl font-bold tracking-tight">
                  Get early access
                </p>
                <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">
                  Bleachers is opening up gradually. Leave your email and we'll let you in.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                />
              </div>

              {error && <p className="text-negative text-center text-sm">{error}</p>}

              <Button type="submit" className="w-full" disabled={status === 'sending' || !email}>
                {status === 'sending' ? <Spinner /> : <ArrowRight className="h-4 w-4" />}
                Join the waitlist
              </Button>

              <p className="text-ink-3 text-center text-xs">
                Already have an account?{' '}
                <Link href="/login" className="text-brand font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
