import { Injectable, NotFoundException } from '@nestjs/common';
import { getSportConfig } from '@bleachers/sport-engine';
import { PrismaService } from '../prisma/prisma.service.js';
import { StatisticsService } from '../statistics/statistics.service.js';

@Injectable()
export class SharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatisticsService,
  ) {}

  /** Public, read-only snapshot of a match: teams, players, score, timeline, stats. */
  async publicMatch(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        lineups: { include: { player: true } },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const stats = await this.stats.matchStatsCore(matchId);
    const playerNames = Object.fromEntries(match.lineups.map((l) => [l.playerId, l.player.name]));

    return {
      match: {
        id: match.id,
        sport: match.sport,
        status: match.status,
        statTier: match.statTier,
        venue: match.venue,
        scheduledAt: match.scheduledAt.toISOString(),
      },
      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.name,
        colors: match.homeTeam.colors,
        logo: match.homeTeam.logo,
      },
      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.name,
        colors: match.awayTeam.colors,
        logo: match.awayTeam.logo,
      },
      playerNames,
      stats,
    };
  }

  /** CSV export of the match event stream (including voided rows, flagged). */
  async matchCsv(matchId: string): Promise<string> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    const config = getSportConfig(match.sport);
    const labelByType = new Map(config.eventTypes.map((e) => [e.id, e.label]));

    const events = await this.prisma.event.findMany({
      where: { matchId },
      include: { player: true },
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { recordedAt: 'asc' }],
    });

    const header = ['period', 'clock_min', 'side', 'event', 'player', 'voided'];
    const rows = events.map((e) => [
      String(e.period),
      String(Math.floor(e.clockMs / 60000)),
      e.side,
      labelByType.get(e.type) ?? e.type,
      e.player?.name ?? '',
      e.voided ? 'true' : 'false',
    ]);

    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  async publicPlayer(playerId: string) {
    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Player not found');
    const career = await this.stats.playerCareerCore(playerId);
    return {
      player: { id: player.id, name: player.name, photo: player.photo },
      career,
    };
  }
}

/**
 * Escape one CSV cell. Beyond RFC-4180 quoting, cells starting with =, +, -, @,
 * or a tab/CR are prefixed with a single quote so user-controlled values (player
 * names) can never execute as formulas when the export opens in Excel/Sheets.
 */
export function csvCell(value: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
}
