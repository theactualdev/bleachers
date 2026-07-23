import type {
  Event as PrismaEvent,
  Match as PrismaMatch,
  MatchLineup as PrismaLineup,
  Player as PrismaPlayer,
  RosterEntry as PrismaRoster,
  Team as PrismaTeam,
} from '@prisma/client';
import type {
  Match,
  MatchEvent,
  MatchLineup,
  Player,
  RosterEntry,
  Team,
  TeamColors,
} from '@bleachers/types';

const iso = (d: Date): string => d.toISOString();

export function toPlayer(p: PrismaPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    dateOfBirth: p.dateOfBirth,
    photo: p.photo,
    createdById: p.createdById,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

export function toTeam(t: PrismaTeam): Team {
  return {
    id: t.id,
    name: t.name,
    colors: t.colors as TeamColors,
    logo: t.logo,
    sport: t.sport,
    isAdHoc: t.isAdHoc,
    createdById: t.createdById,
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
  };
}

export function toRosterEntry(r: PrismaRoster): RosterEntry {
  return {
    id: r.id,
    teamId: r.teamId,
    playerId: r.playerId,
    jerseyNumber: r.jerseyNumber,
    createdAt: iso(r.createdAt),
  };
}

export function toMatch(m: PrismaMatch): Match {
  return {
    id: m.id,
    sport: m.sport,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    venue: m.venue,
    scheduledAt: iso(m.scheduledAt),
    status: m.status,
    statTier: m.statTier,
    competitionId: m.competitionId,
    createdById: m.createdById,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  };
}

export function toLineup(l: PrismaLineup): MatchLineup {
  return {
    id: l.id,
    matchId: l.matchId,
    side: l.side,
    playerId: l.playerId,
    isStarter: l.isStarter,
    jerseyNumberOverride: l.jerseyNumberOverride,
    createdAt: iso(l.createdAt),
  };
}

export function toEvent(e: PrismaEvent): MatchEvent {
  return {
    id: e.id,
    matchId: e.matchId,
    type: e.type,
    side: e.side,
    playerId: e.playerId,
    period: e.period,
    clockMs: e.clockMs,
    metadata: (e.metadata ?? {}) as Record<string, unknown>,
    voided: e.voided,
    voidedById: e.voidedById,
    voidedAt: e.voidedAt ? iso(e.voidedAt) : null,
    replacesEventId: e.replacesEventId,
    recordedById: e.recordedById,
    recordedAt: iso(e.recordedAt),
  };
}
