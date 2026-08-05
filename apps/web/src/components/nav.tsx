'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Users, Shield, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/players', label: 'Players', icon: Users },
  { href: '/teams', label: 'Teams', icon: Shield },
  { href: '/matches/new', label: 'New', icon: Plus },
];

export function Nav() {
  const pathname = usePathname();
  // Hide the app nav on public pages and the immersive live-scoring screen.
  if (
    pathname.startsWith('/m/') ||
    pathname.startsWith('/o/') ||
    pathname.startsWith('/join/') ||
    pathname.endsWith('/live') ||
    pathname === '/login' ||
    pathname === '/waitlist'
  ) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <div className="glass-strong rim relative flex items-stretch justify-between gap-1 overflow-hidden rounded-2xl p-1.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const isNew = href === '/matches/new';
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition-colors duration-200',
                active ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2',
                isNew && !active && 'text-brand',
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="border-hairline bg-glass absolute inset-0 rounded-xl border"
                />
              )}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} />
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
