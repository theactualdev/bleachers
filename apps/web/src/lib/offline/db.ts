'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RecordEventInput } from '@bleachers/types';

/** A queued event awaiting sync to the server. */
export interface QueuedEvent extends RecordEventInput {
  /** Local bookkeeping. */
  queuedAt: number;
  attempts: number;
}

interface BleachersDB extends DBSchema {
  eventQueue: {
    key: string; // event id (UUID) — idempotency key
    value: QueuedEvent;
    indexes: { 'by-match': string };
  };
}

let dbPromise: Promise<IDBPDatabase<BleachersDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<BleachersDB>> {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB is only available in the browser');
  }
  dbPromise ??= openDB<BleachersDB>('bleachers', 1, {
    upgrade(db) {
      const store = db.createObjectStore('eventQueue', { keyPath: 'id' });
      store.createIndex('by-match', 'matchId');
    },
  });
  return dbPromise;
}
