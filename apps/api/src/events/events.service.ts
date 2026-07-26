import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BatchUploadInput,
  BatchUploadResult,
  RecordEventInput,
  VoidEventInput,
} from '@bleachers/types';
import { getSportConfig, isEventTypeAllowed } from '@bleachers/sport-engine';
import type { Match, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipService } from '../orgs/membership.service.js';
import { toEvent } from '../common/serialize.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly members: MembershipService,
  ) {}

  private async getMatchOrThrow(matchId: string): Promise<Match> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    return match;
  }

  /** Validate an event against the match's sport config and tier. Returns a reason string if bad. */
  private validate(match: Match, input: Pick<RecordEventInput, 'type' | 'period'>): string | null {
    const config = getSportConfig(match.sport);
    if (!isEventTypeAllowed(config, input.type, match.statTier)) {
      return `Event type "${input.type}" is not allowed for ${match.sport} (${match.statTier})`;
    }
    const maxPeriod =
      config.periods.regulationCount + config.periods.extraTimeCount + 1; /* +1 for tiebreak */
    if (input.period < 1 || input.period > maxPeriod) {
      return `Period ${input.period} is out of range for ${match.sport}`;
    }
    return null;
  }

  async list(userId: string, matchId: string, includeVoided = false) {
    const match = await this.getMatchOrThrow(matchId);
    await this.members.assertMember(userId, match.organizationId, 'VIEWER');
    const events = await this.prisma.event.findMany({
      where: { matchId, ...(includeVoided ? {} : { voided: false }) },
      orderBy: [{ period: 'asc' }, { clockMs: 'asc' }, { recordedAt: 'asc' }],
    });
    return events.map(toEvent);
  }

  /**
   * Record one event. Idempotent on the client-supplied `id`: replaying the same event (e.g. from
   * the offline queue) returns the already-stored event rather than duplicating it.
   */
  async record(userId: string, input: RecordEventInput) {
    const match = await this.getMatchOrThrow(input.matchId);

    const existing = await this.prisma.event.findUnique({ where: { id: input.id } });
    if (existing) return { event: toEvent(existing), duplicate: true };

    const reason = this.validate(match, input);
    if (reason) throw new BadRequestException(reason);

    const created = await this.prisma.event.create({
      data: {
        id: input.id,
        matchId: input.matchId,
        type: input.type,
        side: input.side,
        playerId: input.playerId ?? null,
        period: input.period,
        clockMs: input.clockMs ?? 0,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        replacesEventId: input.replacesEventId ?? null,
        recordedById: userId,
      },
    });

    const event = toEvent(created);
    this.realtime.broadcastEvent(input.matchId, event);
    return { event, duplicate: false };
  }

  /**
   * Correct an event: void it (never delete), optionally appending a replacement event.
   * This is lossless — the original stays in the stream, flagged.
   */
  async void(userId: string, matchId: string, eventId: string, input: VoidEventInput) {
    const match = await this.getMatchOrThrow(matchId);
    const target = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!target || target.matchId !== matchId) throw new NotFoundException('Event not found');
    if (target.voided) throw new BadRequestException('Event is already voided');

    const result = await this.prisma.$transaction(async (tx) => {
      const voided = await tx.event.update({
        where: { id: eventId },
        data: { voided: true, voidedById: userId, voidedAt: new Date() },
      });

      let replacement = null;
      if (input.replacement) {
        const r = input.replacement;
        const reason = this.validate(match, r);
        if (reason) throw new BadRequestException(reason);
        replacement = await tx.event.create({
          data: {
            id: r.id,
            matchId,
            type: r.type,
            side: r.side,
            playerId: r.playerId ?? null,
            period: r.period,
            clockMs: r.clockMs ?? 0,
            metadata: (r.metadata ?? {}) as Prisma.InputJsonValue,
            replacesEventId: eventId,
            recordedById: userId,
          },
        });
      }
      return { voided, replacement };
    });

    this.realtime.broadcastVoid(matchId, eventId);
    if (result.replacement) {
      this.realtime.broadcastEvent(matchId, toEvent(result.replacement));
    }
    return {
      voided: toEvent(result.voided),
      replacement: result.replacement ? toEvent(result.replacement) : null,
    };
  }

  /** Undo = void the most recent non-voided event of a match. Powers the scoring-screen Undo. */
  async undoLast(userId: string, matchId: string) {
    await this.getMatchOrThrow(matchId);
    const last = await this.prisma.event.findFirst({
      where: { matchId, voided: false },
      orderBy: [{ recordedAt: 'desc' }],
    });
    if (!last) throw new BadRequestException('No events to undo');
    return this.void(userId, matchId, last.id, {});
  }

  /**
   * Offline sync: upload a batch of queued events. Upserts by `id` so replays are safe. Returns a
   * per-id breakdown so the client can clear its queue precisely.
   */
  async batchUpload(userId: string, input: BatchUploadInput): Promise<BatchUploadResult> {
    const match = await this.getMatchOrThrow(input.matchId);

    const ids = input.events.map((e) => e.id);
    const existing = await this.prisma.event.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));

    const accepted: string[] = [];
    const duplicates: string[] = [];
    const rejected: { id: string; reason: string }[] = [];
    const toCreate: Prisma.EventCreateManyInput[] = [];

    for (const e of input.events) {
      if (e.matchId !== input.matchId) {
        rejected.push({ id: e.id, reason: 'matchId mismatch' });
        continue;
      }
      if (existingIds.has(e.id)) {
        duplicates.push(e.id);
        continue;
      }
      const reason = this.validate(match, e);
      if (reason) {
        rejected.push({ id: e.id, reason });
        continue;
      }
      toCreate.push({
        id: e.id,
        matchId: e.matchId,
        type: e.type,
        side: e.side,
        playerId: e.playerId ?? null,
        period: e.period,
        clockMs: e.clockMs ?? 0,
        metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
        replacesEventId: e.replacesEventId ?? null,
        recordedById: userId,
      });
      accepted.push(e.id);
    }

    if (toCreate.length > 0) {
      await this.prisma.event.createMany({ data: toCreate, skipDuplicates: true });
      const created = await this.prisma.event.findMany({ where: { id: { in: accepted } } });
      for (const c of created) this.realtime.broadcastEvent(input.matchId, toEvent(c));
    }

    return { accepted, duplicates, rejected };
  }

  /** Guard helper: ensure the user may write to this match (SCORER+ in the match's org). */
  async assertCanScore(userId: string, matchId: string): Promise<void> {
    const match = await this.getMatchOrThrow(matchId);
    await this.members.assertMember(userId, match.organizationId, 'SCORER');
  }
}
