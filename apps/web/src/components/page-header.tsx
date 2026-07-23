'use client';

import Link from 'next/link';
import { signOut, useSession } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

/**
 * Sticky glass header. `eyebrow` sets the small tracked label above the title;
 * `title` uses the condensed display face for athletic presence.
 */
export function PageHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
}) {
  const { data } = useSession();
  return (
    <header className="glass sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 rounded-b-2xl border-x-0 border-t-0 px-5 py-4">
      <Link href="/" className="min-w-0">
        {eyebrow && <p className="text-eyebrow text-ink-3">{eyebrow}</p>}
        <h1 className="font-display text-ink-1 truncate text-2xl font-bold uppercase tracking-tight">
          {title}
        </h1>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {data && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={() => signOut()}
            title={data.user.email}
          >
            <LogOut className="h-[18px] w-[18px]" />
          </Button>
        )}
      </div>
    </header>
  );
}
