'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMatchInput,
  CreatePlayerInput,
  Match,
  MatchEvent,
  MatchLineup,
  MatchStats,
  MembershipInfo,
  Player,
  PlayerCareerStats,
  RegisterTeamInput,
  RosterEntryWithPlayer,
  Team,
} from '@bleachers/types';
import type { SportConfig } from '@bleachers/sport-engine';
import { apiGet, apiPost, API_URL, ApiError } from './api';
import { supabase } from './supabase';
import { useActiveOrgId, useOrgStore } from './org-store';

type MatchWithTeams = Match & { homeTeam: Team; awayTeam: Team };
type MatchDetail = MatchWithTeams & { lineups: MatchLineup[] };

// ── Current user / org bootstrap ────────────────────────────────────────────
export interface Me extends Record<string, unknown> {
  id: string;
  email: string | null;
  memberships: MembershipInfo[];
}

export function useMe() {
  const setMemberships = useOrgStore((s) => s.setMemberships);
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = await apiGet<Me>('/api/me');
      setMemberships(me.memberships);
      return me;
    },
  });
}

// ── Media ────────────────────────────────────────────────────────────────────
/**
 * Uploads an image blob to `/api/media/upload` and resolves the public URL.
 * Can't reuse `api()` — multipart bodies must NOT set a `Content-Type` header
 * (the browser attaches the multipart boundary itself) — so this mirrors the
 * auth/org header pattern from `api.ts` inline.
 */
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: Blob): Promise<{ url: string }> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const activeOrgId = useOrgStore.getState().activeOrgId;

      const body = new FormData();
      body.append('file', file);

      const res = await fetch(`${API_URL}/api/media/upload`, {
        method: 'POST',
        body,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(activeOrgId ? { 'X-Organization-Id': activeOrgId } : {}),
        },
      });

      if (!res.ok) {
        let responseBody: unknown;
        try {
          responseBody = await res.json();
        } catch {
          responseBody = await res.text().catch(() => undefined);
        }
        const message =
          (responseBody as { message?: string })?.message ?? `Upload failed (${res.status})`;
        throw new ApiError(res.status, message, responseBody);
      }

      return (await res.json()) as { url: string };
    },
  });
}

// ── Players ──────────────────────────────────────────────────────────────────
export const usePlayers = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['players', orgId],
    queryFn: () => apiGet<Player[]>('/api/players'),
    enabled: !!orgId,
  });
};

export function useCreatePlayer() {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: CreatePlayerInput) => apiPost<Player>('/api/players', input),
    // Optimistically show the new player immediately, then reconcile.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['players', orgId] });
      const previous = qc.getQueryData<Player[]>(['players', orgId]);
      const now = new Date().toISOString();
      const optimistic: Player = {
        id: `optimistic-${now}`,
        name: input.name,
        dateOfBirth: input.dateOfBirth ?? null,
        photo: input.photo ?? null,
        createdById: 'me',
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<Player[]>(['players', orgId], (old) =>
        [...(old ?? []), optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['players', orgId], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['players', orgId] }),
  });
}

export const usePlayerCareer = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['player-career', orgId, id],
    queryFn: () => apiGet<PlayerCareerStats>(`/api/players/${id}/career`),
    enabled: !!id && !!orgId,
  });
};

// ── Teams ────────────────────────────────────────────────────────────────────
export const useTeams = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['teams', orgId],
    queryFn: () => apiGet<Team[]>('/api/teams'),
    enabled: !!orgId,
  });
};

/**
 * Composite registration: creates the team, its team-born players, and their
 * roster entries in one server round-trip. No optimistic update — unlike
 * `useCreateTeam` there's no single "shape" to fake ahead of a roster of
 * unknown size, so we just wait for the transaction and invalidate.
 */
export function useRegisterTeam() {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: RegisterTeamInput) =>
      apiPost<{ team: Team; roster: RosterEntryWithPlayer[] }>('/api/teams/register', input),
    onSuccess: ({ team }) => {
      qc.invalidateQueries({ queryKey: ['teams', orgId] });
      qc.invalidateQueries({ queryKey: ['players', orgId] });
      qc.invalidateQueries({ queryKey: ['roster', orgId, team.id] });
    },
  });
}

export const useRoster = (teamId: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['roster', orgId, teamId],
    queryFn: () => apiGet<RosterEntryWithPlayer[]>(`/api/teams/${teamId}/roster`),
    enabled: !!teamId && !!orgId,
  });
};

/**
 * A map of playerId → the teams that player is currently on, built from the
 * (cached, shared) per-team roster queries. Used to show "already on X" hints.
 */
export function useTeamMemberships(): Map<string, Team[]> {
  const orgId = useActiveOrgId();
  const { data: teams } = useTeams();
  const rosters = useQueries({
    queries: (teams ?? []).map((t) => ({
      queryKey: ['roster', orgId, t.id],
      queryFn: () => apiGet<RosterEntryWithPlayer[]>(`/api/teams/${t.id}/roster`),
      enabled: !!t.id && !!orgId,
    })),
  });

  const byPlayer = new Map<string, Team[]>();
  (teams ?? []).forEach((team, i) => {
    for (const entry of rosters[i]?.data ?? []) {
      const list = byPlayer.get(entry.playerId) ?? [];
      list.push(team);
      byPlayer.set(entry.playerId, list);
    }
  });
  return byPlayer;
}

export function useAddToRoster(teamId: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: { playerId: string; jerseyNumber?: string | null }) =>
      apiPost<RosterEntryWithPlayer>(`/api/teams/${teamId}/roster`, input),
    // Optimistically drop the player into the roster so the UI responds instantly.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['roster', orgId, teamId] });
      const previous = qc.getQueryData<RosterEntryWithPlayer[]>(['roster', orgId, teamId]);
      const player = qc
        .getQueryData<Player[]>(['players', orgId])
        ?.find((p) => p.id === input.playerId);
      if (player) {
        const optimistic: RosterEntryWithPlayer = {
          id: `optimistic-${input.playerId}`,
          teamId,
          playerId: input.playerId,
          jerseyNumber: input.jerseyNumber ?? null,
          createdAt: new Date().toISOString(),
          player,
        };
        qc.setQueryData<RosterEntryWithPlayer[]>(['roster', orgId, teamId], (old) => [
          ...(old ?? []),
          optimistic,
        ]);
      }
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['roster', orgId, teamId], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['roster', orgId, teamId] }),
  });
}

// ── Matches ──────────────────────────────────────────────────────────────────
export const useMatches = () => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['matches', orgId],
    queryFn: () => apiGet<MatchWithTeams[]>('/api/matches'),
    enabled: !!orgId,
  });
};

export const useMatch = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['match', orgId, id],
    queryFn: () => apiGet<MatchDetail>(`/api/matches/${id}`),
    enabled: !!id && !!orgId,
  });
};

export function useCreateMatch() {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  return useMutation({
    mutationFn: (input: CreateMatchInput) => apiPost<MatchDetail>('/api/matches', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches', orgId] }),
  });
}

// ── Sport config ─────────────────────────────────────────────────────────────
export const useSportConfig = (sport: string) =>
  useQuery({
    queryKey: ['sport-config', sport],
    queryFn: () => apiGet<SportConfig>(`/api/sports/${sport}/config`),
    enabled: !!sport,
    staleTime: Infinity,
  });

// ── Stats & events ───────────────────────────────────────────────────────────
export const useMatchStats = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['match-stats', orgId, id],
    queryFn: () => apiGet<MatchStats>(`/api/matches/${id}/stats`),
    enabled: !!id && !!orgId,
  });
};

export const useMatchEvents = (id: string) => {
  const orgId = useActiveOrgId();
  return useQuery({
    queryKey: ['match-events', orgId, id],
    queryFn: () => apiGet<MatchEvent[]>(`/api/matches/${id}/events`),
    enabled: !!id && !!orgId,
  });
};
