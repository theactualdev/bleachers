'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { API_URL } from '@/lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setStatus('error');
      setError(error.message ?? 'Could not send the link');
    } else {
      setStatus('sent');
    }
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-2 py-4 text-center"
            >
              <CheckCircle2 className="text-live h-10 w-10" />
              <p className="text-ink-1 font-semibold">Check your email</p>
              <p className="text-ink-2 text-sm">
                We sent a sign-in link to <span className="text-ink-1 font-medium">{email}</span>.
              </p>
              <p className="text-ink-3 mt-2 text-xs">
                In dev, the link is emailed to you (SMTP configured in Supabase).
              </p>
            </motion.div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-4">
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
              {error && <p className="text-negative text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? <Spinner /> : <Mail className="h-4 w-4" />}
                Send magic link
              </Button>
              <div className="flex items-center gap-3 py-1">
                <span className="bg-hairline h-px flex-1" />
                <span className="text-ink-3 text-eyebrow">or</span>
                <span className="bg-hairline h-px flex-1" />
              </div>
              <Button
                type="button"
                variant="glass"
                className="w-full"
                onClick={() =>
                  supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/` },
                  })
                }
              >
                Continue with Google
              </Button>
              <p className="text-ink-3 text-center text-[11px]">
                Google sign-in requires OAuth credentials in the API env.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="text-ink-3 text-[11px]">API: {API_URL}</p>
    </div>
  );
}
