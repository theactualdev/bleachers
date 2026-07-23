'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMatchInput,
  CreatePlayerInput,
  CreateTeamInput,
  Match,
  MatchEvent,
  MatchLineup,
  MatchStats,
  Player,
  PlayerCareerStats,
  RosterEntryWithPlayer,
  Team,
} from '@bleachers/types';
import type { SportConfig } from '@bleachers/sport-engine';
import { apiGet, apiPost } from './api';

type MatchWithTeams = Match & { homeTeam: Team; awayTeam: Team };
type MatchDetail = MatchWithTeams & { lineups: MatchLineup[] };

// ── Players ──────────────────────────────────────────────────────────────────
export const usePlayers = () =>
  useQuery({ queryKey: ['players'], queryFn: () => apiGet<Player[]>('/api/players') });

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlayerInput) => apiPost<Player>('/api/players', input),
    // Optimistically show the new player immediately, then reconcile.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['players'] });
      const previous = qc.getQueryData<Player[]>(['players']);
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
      qc.setQueryData<Player[]>(['players'], (old) =>
        [...(old ?? []), optimistic].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['players'], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

export const usePlayerCareer = (id: string) =>
  useQuery({
    queryKey: ['player-career', id],
    queryFn: () => apiGet<PlayerCareerStats>(`/api/players/${id}/career`),
    enabled: !!id,
  });

// ── Teams ────────────────────────────────────────────────────────────────────
export const useTeams = () =>
  useQuery({ queryKey: ['teams'], queryFn: () => apiGet<Team[]>('/api/teams') });

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => apiPost<Team>('/api/teams', input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['teams'] });
      const previous = qc.getQueryData<Team[]>(['teams']);
      const now = new Date().toISOString();
      const optimistic: Team = {
        id: `optimistic-${now}`,
        name: input.name,
        colors: input.colors,
        logo: input.logo ?? null,
        sport: input.sport,
        isAdHoc: input.isAdHoc ?? false,
        createdById: 'me',
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<Team[]>(['teams'], (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['teams'], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export const useRoster = (teamId: string) =>
  useQuery({
    queryKey: ['roster', teamId],
    queryFn: () => apiGet<RosterEntryWithPlayer[]>(`/api/teams/${teamId}/roster`),
    enabled: !!teamId,
  });

/**
 * A map of playerId → the teams that player is currently on, built from the
 * (cached, shared) per-team roster queries. Used to show "already on X" hints.
 */
export function useTeamMemberships(): Map<string, Team[]> {
  const { data: teams } = useTeams();
  const rosters = useQueries({
    queries: (teams ?? []).map((t) => ({
      queryKey: ['roster', t.id],
      queryFn: () => apiGet<RosterEntryWithPlayer[]>(`/api/teams/${t.id}/roster`),
      enabled: !!t.id,
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
  return useMutation({
    mutationFn: (input: { playerId: string; jerseyNumber?: string | null }) =>
      apiPost<RosterEntryWithPlayer>(`/api/teams/${teamId}/roster`, input),
    // Optimistically drop the player into the roster so the UI responds instantly.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['roster', teamId] });
      const previous = qc.getQueryData<RosterEntryWithPlayer[]>(['roster', teamId]);
      const player = qc.getQueryData<Player[]>(['players'])?.find((p) => p.id === input.playerId);
      if (player) {
        const optimistic: RosterEntryWithPlayer = {
          id: `optimistic-${input.playerId}`,
          teamId,
          playerId: input.playerId,
          jerseyNumber: input.jerseyNumber ?? null,
          createdAt: new Date().toISOString(),
          player,
        };
        qc.setQueryData<RosterEntryWithPlayer[]>(['roster', teamId], (old) => [
          ...(old ?? []),
          optimistic,
        ]);
      }
      return { previous };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['roster', teamId], ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['roster', teamId] }),
  });
}

// ── Matches ──────────────────────────────────────────────────────────────────
export const useMatches = () =>
  useQuery({ queryKey: ['matches'], queryFn: () => apiGet<MatchWithTeams[]>('/api/matches') });

export const useMatch = (id: string) =>
  useQuery({
    queryKey: ['match', id],
    queryFn: () => apiGet<MatchDetail>(`/api/matches/${id}`),
    enabled: !!id,
  });

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMatchInput) => apiPost<MatchDetail>('/api/matches', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matches'] }),
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
export const useMatchStats = (id: string) =>
  useQuery({
    queryKey: ['match-stats', id],
    queryFn: () => apiGet<MatchStats>(`/api/matches/${id}/stats`),
    enabled: !!id,
  });

export const useMatchEvents = (id: string) =>
  useQuery({
    queryKey: ['match-events', id],
    queryFn: () => apiGet<MatchEvent[]>(`/api/matches/${id}/events`),
    enabled: !!id,
  });
