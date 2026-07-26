'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import type { Organization, OrgRole } from '@bleachers/types';
import { AuthGate } from '@/components/auth-gate';
import { PageHeader } from '@/components/page-header';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { API_URL } from '@/lib/api-url';
import { useMe } from '@/lib/hooks';
import { useActiveOrgId } from '@/lib/org-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { Badge, EmptyState, Skeleton, Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';

interface OrgMemberRow {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
  user: { id: string; email: string | null; name: string | null; image: string | null };
}

interface OrgInviteRow {
  id: string;
  orgId: string;
  token: string;
  role: OrgRole;
  createdById: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

const ROLE_OPTIONS: SelectOption[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'SCORER', label: 'Scorer' },
  { value: 'VIEWER', label: 'Viewer' },
];

function roleLabel(role: OrgRole) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

// ── Locally-scoped queries (per the plan, these live in this page's module) ──
function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => apiGet<OrgMemberRow[]>(`/api/orgs/${orgId}/members`),
    enabled: !!orgId,
  });
}

function useOrgInvites(orgId: string | null) {
  return useQuery({
    queryKey: ['org-invites', orgId],
    queryFn: () => apiGet<OrgInviteRow[]>(`/api/orgs/${orgId}/invites`),
    enabled: !!orgId,
  });
}

/**
 * There is no "get one org" endpoint, so the current public/private state is
 * inferred from whether the public profile endpoint answers for this slug.
 */
function usePublicStatus(slug: string | undefined) {
  return useQuery({
    queryKey: ['org-public-check', slug],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/public/orgs/${slug}`, { cache: 'no-store' });
      return res.ok;
    },
    enabled: !!slug,
  });
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'ease-spring relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-brand' : 'glass',
      )}
    >
      <span
        className={cn(
          'ease-spring absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-button transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission denied — nothing else we can do here */
    }
  }
  return (
    <Button
      type="button"
      variant="glass"
      size="icon"
      onClick={copy}
      aria-label="Copy link"
      title={text}
    >
      {copied ? <Check className="text-live h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function OrgSettingsScreen() {
  const { data: me } = useMe();
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const active = me?.memberships.find((m) => m.orgId === orgId);
  const isOwner = active?.role === 'OWNER';

  const { data: members, isLoading: membersLoading, isError: membersError } = useOrgMembers(orgId);
  const {
    data: invites,
    isLoading: invitesLoading,
    isError: invitesError,
  } = useOrgInvites(isOwner ? orgId : null);
  const { data: isPublic, isLoading: publicLoading } = usePublicStatus(
    isOwner ? active?.slug : undefined,
  );

  // ── Rename ───────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  useEffect(() => {
    if (active?.orgName) setName(active.orgName);
  }, [active?.orgName]);

  const renameOrg = useMutation({
    mutationFn: (newName: string) => apiPatch<Organization>(`/api/orgs/${orgId}`, { name: newName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  // ── Public toggle ────────────────────────────────────────────────────────
  const togglePublic = useMutation({
    mutationFn: (next: boolean) => apiPatch<Organization>(`/api/orgs/${orgId}`, { isPublic: next }),
    onSuccess: (org) => qc.setQueryData(['org-public-check', org.slug], org.isPublic),
  });
  const displayPublic = togglePublic.isPending
    ? (togglePublic.variables ?? false)
    : (isPublic ?? false);
  // Safe: this screen only ever mounts client-side, behind AuthGate.
  const origin = window.location.origin;

  // ── Members ──────────────────────────────────────────────────────────────
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      apiPatch(`/api/orgs/${orgId}/members/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => apiDelete(`/api/orgs/${orgId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  // ── Invites ──────────────────────────────────────────────────────────────
  const [inviteRole, setInviteRole] = useState<OrgRole>('SCORER');
  const createInvite = useMutation({
    mutationFn: (role: OrgRole) => apiPost<OrgInviteRow>(`/api/orgs/${orgId}/invites`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) => apiPost(`/api/orgs/${orgId}/invites/${inviteId}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-invites', orgId] }),
  });

  const loading = !me || !orgId || membersLoading;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4 px-4 py-2">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[60px] w-full" />
            <Skeleton className="h-[60px] w-full" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{active?.orgName ?? 'Organization'}</CardTitle>
                    <p className="text-ink-3 mt-1 text-xs">Your role</p>
                  </div>
                  {active && <Badge variant="outline">{roleLabel(active.role)}</Badge>}
                </div>
              </CardHeader>
            </Card>

            {isOwner && (
              <Card>
                <CardHeader>
                  <CardTitle>Organization name</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-label="Organization name"
                    />
                    <Button
                      onClick={() => renameOrg.mutate(name.trim())}
                      disabled={
                        renameOrg.isPending || !name.trim() || name.trim() === active?.orgName
                      }
                    >
                      {renameOrg.isPending ? <Spinner /> : 'Save'}
                    </Button>
                  </div>
                  {renameOrg.isError && (
                    <p className="text-negative text-sm">
                      {errorMessage(renameOrg.error, 'Could not rename the organization')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {isOwner && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle>Public page</CardTitle>
                      <p className="text-ink-2 mt-1 text-sm">
                        Anyone with the link can view your teams and match results.
                      </p>
                    </div>
                    <Toggle
                      checked={displayPublic}
                      disabled={publicLoading || togglePublic.isPending}
                      onChange={(next) => togglePublic.mutate(next)}
                    />
                  </div>
                </CardHeader>
                {displayPublic && active?.slug && (
                  <CardContent className="flex items-center gap-2 pt-0">
                    <div className="glass border-hairline text-ink-2 flex h-11 min-w-0 flex-1 items-center gap-2 truncate rounded-md border px-4 text-sm">
                      <Link2 className="text-ink-3 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {origin}/o/{active.slug}
                      </span>
                    </div>
                    <CopyButton text={`${origin}/o/${active.slug}`} />
                  </CardContent>
                )}
                {togglePublic.isError && (
                  <CardContent className="pt-0">
                    <p className="text-negative text-sm">
                      {errorMessage(togglePublic.error, 'Could not update visibility')}
                    </p>
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {membersError ? (
                  <p className="text-negative text-sm">Could not load members.</p>
                ) : members && members.length === 0 ? (
                  <EmptyState title="No members yet" />
                ) : (
                  members?.map((m) => {
                    const label = m.user.name ?? m.user.email ?? 'Member';
                    const pendingRemove =
                      removeMember.isPending && removeMember.variables === m.userId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'border-hairline flex items-center gap-3 border-b pb-2 last:border-b-0 last:pb-0',
                          pendingRemove && 'opacity-50',
                        )}
                      >
                        <div className="glass font-display text-ink-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                          {label.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-1 truncate text-sm font-semibold">{label}</p>
                          {m.user.email && m.user.name && (
                            <p className="text-ink-3 truncate text-xs">{m.user.email}</p>
                          )}
                        </div>
                        {isOwner ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <Select
                              value={m.role}
                              options={ROLE_OPTIONS}
                              aria-label={`Role for ${label}`}
                              onChange={(role) =>
                                changeRole.mutate({ userId: m.userId, role: role as OrgRole })
                              }
                              className="w-32"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${label}`}
                              disabled={pendingRemove}
                              onClick={() => removeMember.mutate(m.userId)}
                            >
                              <Trash2 className="text-negative h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" className="shrink-0">
                            {roleLabel(m.role)}
                          </Badge>
                        )}
                      </div>
                    );
                  })
                )}
                {(changeRole.isError || removeMember.isError) && (
                  <p className="text-negative text-sm">
                    {errorMessage(changeRole.error ?? removeMember.error, 'Could not update member')}
                  </p>
                )}
              </CardContent>
            </Card>

            {isOwner && (
              <Card>
                <CardHeader>
                  <CardTitle>Invite people</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <div className="flex gap-2">
                    <Select
                      value={inviteRole}
                      options={ROLE_OPTIONS}
                      aria-label="Invite role"
                      onChange={(role) => setInviteRole(role as OrgRole)}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => createInvite.mutate(inviteRole)}
                      disabled={createInvite.isPending}
                    >
                      {createInvite.isPending ? <Spinner /> : 'Create invite link'}
                    </Button>
                  </div>
                  {createInvite.isError && (
                    <p className="text-negative text-sm">
                      {errorMessage(createInvite.error, 'Could not create invite')}
                    </p>
                  )}

                  {invitesLoading ? (
                    <Skeleton className="h-11 w-full" />
                  ) : invitesError ? (
                    <p className="text-negative text-sm">Could not load invites.</p>
                  ) : (
                    invites &&
                    invites.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {invites.map((inv) => {
                          const url = `${origin}/join/${inv.token}`;
                          const pendingRevoke =
                            revokeInvite.isPending && revokeInvite.variables === inv.id;
                          return (
                            <div
                              key={inv.id}
                              className={cn(
                                'flex items-center gap-2',
                                pendingRevoke && 'opacity-50',
                              )}
                            >
                              <div className="glass border-hairline text-ink-2 flex h-11 min-w-0 flex-1 items-center gap-2 truncate rounded-md border px-4 text-sm">
                                <span className="truncate">{url}</span>
                              </div>
                              <Badge variant="outline" className="shrink-0">
                                {roleLabel(inv.role)}
                              </Badge>
                              <CopyButton text={url} />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Revoke invite"
                                disabled={pendingRevoke}
                                onClick={() => revokeInvite.mutate(inv.id)}
                              >
                                <Trash2 className="text-negative h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                  {revokeInvite.isError && (
                    <p className="text-negative text-sm">
                      {errorMessage(revokeInvite.error, 'Could not revoke invite')}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function OrgPage() {
  return (
    <AuthGate>
      <OrgSettingsScreen />
    </AuthGate>
  );
}
