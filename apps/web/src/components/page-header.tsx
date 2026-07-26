'use client';

import Link from 'next/link';
import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, LogOut } from 'lucide-react';
import type { MembershipInfo } from '@bleachers/types';
import { signOut, useSession } from '@/lib/auth-client';
import { useMe } from '@/lib/hooks';
import { useActiveOrgId, useOrgStore } from '@/lib/org-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Sticky glass header. `eyebrow` sets the small tracked label above the title;
 * `title` uses the condensed display face for athletic presence. When the
 * signed-in user belongs to more than one organization, the eyebrow slot
 * becomes an org switcher instead of static text.
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
  const { data: me } = useMe();
  const activeOrgId = useActiveOrgId();
  const setActiveOrg = useOrgStore((s) => s.setActiveOrg);
  const memberships = me?.memberships ?? [];
  const active = memberships.find((m) => m.orgId === activeOrgId);

  return (
    <header className="glass sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 rounded-b-2xl border-x-0 border-t-0 px-5 py-4">
      <div className="min-w-0">
        {memberships.length > 1 ? (
          <OrgSwitcher
            memberships={memberships}
            activeOrgId={activeOrgId}
            fallback={eyebrow}
            onSelect={setActiveOrg}
          />
        ) : (
          (active?.orgName ?? eyebrow) && (
            <p className="text-eyebrow text-ink-3">{active?.orgName ?? eyebrow}</p>
          )
        )}
        <Link href="/" className="min-w-0">
          <h1 className="font-display text-ink-1 truncate text-2xl font-bold uppercase tracking-tight">
            {title}
          </h1>
        </Link>
      </div>
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

/** Reuses the glass listbox styling from `ui/select.tsx` for visual consistency. */
function OrgSwitcher({
  memberships,
  activeOrgId,
  fallback,
  onSelect,
}: {
  memberships: MembershipInfo[];
  activeOrgId: string | null;
  fallback?: string;
  onSelect: (orgId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = memberships.find((m) => m.orgId === activeOrgId);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative -ml-0.5">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch organization"
        onClick={() => setOpen((o) => !o)}
        className="text-eyebrow text-ink-3 hover:text-ink-1 ease-spring flex items-center gap-1 rounded-sm px-0.5 transition-colors duration-200"
      >
        <span className="truncate">{active?.orgName ?? fallback ?? 'Select organization'}</span>
        <ChevronDown
          className={cn('h-3 w-3 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="glass-strong rim absolute z-50 mt-2 max-h-64 w-60 origin-top-left overflow-auto rounded-md p-1.5"
          >
            {memberships.map((m) => (
              <li key={m.orgId} role="option" aria-selected={m.orgId === activeOrgId}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(m.orgId);
                    setOpen(false);
                  }}
                  className="hover:bg-glass flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-ink-1 block truncate text-sm font-medium">
                      {m.orgName}
                    </span>
                    <span className="text-ink-3 block truncate text-xs capitalize">
                      {m.role.toLowerCase()}
                    </span>
                  </span>
                  {m.orgId === activeOrgId && <Check className="text-brand h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
            <li role="option" aria-selected={false}>
              <Link
                href="/org"
                onClick={() => setOpen(false)}
                className="hover:bg-glass text-ink-2 mt-0.5 block truncate rounded-sm border-t border-white/10 px-3 py-2 text-left text-sm transition-colors"
              >
                Org settings
              </Link>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
