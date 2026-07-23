'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  MatchEvent,
  MatchSide,
  MatchStats,
  RecordEventInput,
  StatTier,
} from '@bleachers/types';
import { getSportConfig, reduceMatch } from '@bleachers/sport-engine';
import type { Sport } from '@bleachers/types';
import { apiPost } from './api';
import { enqueueEvent, flushQueue, queuedForMatch, queueSize } from './offline/queue';
import { useConnectivity } from './store';
import { uuid } from './utils';
import { useMatchEvents } from './hooks';

interface RecordArgs {
  type: string;
  side: MatchSide;
  playerId: string | null;
  period: number;
  clockMs: number;
  requiresPlayer: boolean;
}

/**
 * Offline-first scoring state. Merges server events with a local overlay of optimistic
 * (and voided) events, keyed by id so replays never double-count. Derives all stats on the
 * client via the same engine the server uses — instant feedback, works offline.
 */
export function useLiveScoring(matchId: string, sport: Sport, tier: StatTier) {
  const qc = useQueryClient();
  const { setPending } = useConnectivity();
  const { data: serverEvents } = useMatchEvents(matchId);
  const [overlay, setOverlay] = useState<Record<string, MatchEvent>>({});

  // On mount, hydrate the overlay with any events still queued locally (unsynced across reloads).
  useEffect(() => {
    let active = true;
    void queuedForMatch(matchId).then((queued) => {
      if (!active || queued.length === 0) return;
      setOverlay((prev) => {
        const next = { ...prev };
        for (const q of queued) {
          if (!next[q.id]) next[q.id] = toOptimistic(q, matchId);
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [matchId]);

  const events: MatchEvent[] = useMemo(() => {
    const byId = new Map<string, MatchEvent>();
    for (const e of serverEvents ?? []) byId.set(e.id, e);
    for (const e of Object.values(overlay)) byId.set(e.id, e); // overlay wins (optimistic)
    return [...byId.values()];
  }, [serverEvents, overlay]);

  const stats: MatchStats = useMemo(
    () => reduceMatch(getSportConfig(sport), matchId, events, tier),
    [events, matchId, sport, tier],
  );

  const syncNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    await flushQueue();
    setPending(await queueSize());
    void qc.invalidateQueries({ queryKey: ['match-events', matchId] });
  }, [matchId, qc, setPending]);

  const record = useCallback(
    async (args: RecordArgs) => {
      const input: RecordEventInput = {
        id: uuid(),
        matchId,
        type: args.type,
        side: args.side,
        playerId: args.requiresPlayer ? args.playerId : null,
        period: args.period,
        clockMs: args.clockMs,
        clientRecordedAt: new Date().toISOString(),
      };
      // 1. Optimistic overlay for instant UI.
      setOverlay((prev) => ({ ...prev, [input.id]: toOptimistic(input, matchId) }));
      // 2. Durable queue (survives reload / offline).
      await enqueueEvent(input);
      setPending(await queueSize());
      // 3. Best-effort immediate sync.
      void syncNow();
      return input.id;
    },
    [matchId, setPending, syncNow],
  );

  const undoLast = useCallback(async () => {
    const active = events
      .filter((e) => !e.voided)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const last = active[active.length - 1];
    if (!last) return;

    // Optimistically void locally.
    setOverlay((prev) => ({
      ...prev,
      [last.id]: { ...last, voided: true, voidedAt: new Date().toISOString() },
    }));

    // Remove from the queue if it never reached the server; otherwise ask the server to void it.
    const queued = await queuedForMatch(matchId);
    const stillQueued = queued.some((q) => q.id === last.id);
    if (stillQueued) {
      const { dequeueEvents } = await import('./offline/queue');
      await dequeueEvents([last.id]);
      setOverlay((prev) => {
        const next = { ...prev };
        delete next[last.id];
        return next;
      });
    } else if (navigator.onLine) {
      try {
        await apiPost(`/api/matches/${matchId}/events/undo`, {});
        void qc.invalidateQueries({ queryKey: ['match-events', matchId] });
      } catch {
        /* leave optimistic void in place; a later refetch reconciles */
      }
    }
    setPending(await queueSize());
  }, [events, matchId, qc, setPending]);

  return { events, stats, record, undoLast, syncNow };
}

function toOptimistic(input: RecordEventInput, matchId: string): MatchEvent {
  return {
    id: input.id,
    matchId,
    type: input.type,
    side: input.side,
    playerId: input.playerId ?? null,
    period: input.period,
    clockMs: input.clockMs ?? 0,
    metadata: input.metadata ?? {},
    voided: false,
    voidedById: null,
    voidedAt: null,
    replacesEventId: input.replacesEventId ?? null,
    recordedById: 'local',
    recordedAt: input.clientRecordedAt ?? new Date().toISOString(),
  };
}
