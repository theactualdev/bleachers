'use client';

import type { BatchUploadResult, RecordEventInput } from '@bleachers/types';
import { apiPost } from '../api';
import { getDb, type QueuedEvent } from './db';

/** Add an event to the durable offline queue. Safe to call whether online or offline. */
export async function enqueueEvent(event: RecordEventInput): Promise<void> {
  const db = await getDb();
  await db.put('eventQueue', { ...event, queuedAt: Date.now(), attempts: 0 });
}

/** Remove events from the queue once the server has confirmed them. */
export async function dequeueEvents(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('eventQueue', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function queuedForMatch(matchId: string): Promise<QueuedEvent[]> {
  const db = await getDb();
  return db.getAllFromIndex('eventQueue', 'by-match', matchId);
}

export async function queueSize(): Promise<number> {
  const db = await getDb();
  return db.count('eventQueue');
}

/**
 * Flush all queued events to the server, grouped by match, via the idempotent batch endpoint.
 * Accepted and duplicate ids are both cleared (a duplicate means the server already has it).
 * Returns the number of events successfully reconciled.
 */
export async function flushQueue(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  const db = await getDb();
  const all = await db.getAll('eventQueue');
  if (all.length === 0) return 0;

  const byMatch = new Map<string, QueuedEvent[]>();
  for (const e of all) {
    const list = byMatch.get(e.matchId) ?? [];
    list.push(e);
    byMatch.set(e.matchId, list);
  }

  let reconciled = 0;
  for (const [matchId, events] of byMatch) {
    try {
      const result = await apiPost<BatchUploadResult>('/api/sync/events', {
        matchId,
        events: events.map(({ queuedAt: _q, attempts: _a, ...rest }) => rest),
      });
      const done = [...result.accepted, ...result.duplicates];
      await dequeueEvents(done);
      reconciled += done.length;
      // Rejected events are left in the queue with a bumped attempt count for inspection.
      for (const r of result.rejected) {
        const existing = await db.get('eventQueue', r.id);
        if (existing) await db.put('eventQueue', { ...existing, attempts: existing.attempts + 1 });
      }
    } catch {
      // Network/transient failure: leave the batch queued and retry on the next flush.
    }
  }
  return reconciled;
}
