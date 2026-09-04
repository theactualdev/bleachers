import { describe, expect, it } from 'vitest';
import {
  applyClockAction,
  canRecordInteractive,
  ClockTransitionError,
  deriveElapsedMs,
  type MatchClockState,
} from './clock.js';

const T0 = 1_700_000_000_000;

const scheduled: MatchClockState = {
  status: 'SCHEDULED',
  periodStartedAt: null,
  pausedElapsedMs: 0,
  currentPeriod: 1,
};

describe('deriveElapsedMs', () => {
  it('returns banked time when the clock is stopped', () => {
    expect(deriveElapsedMs({ periodStartedAt: null, pausedElapsedMs: 90_000 }, T0)).toBe(90_000);
  });

  it('adds wall-clock time since start when running', () => {
    const state = { periodStartedAt: new Date(T0).toISOString(), pausedElapsedMs: 60_000 };
    expect(deriveElapsedMs(state, T0 + 30_000)).toBe(90_000);
  });

  it('never goes negative on clock skew', () => {
    const state = { periodStartedAt: new Date(T0).toISOString(), pausedElapsedMs: 0 };
    expect(deriveElapsedMs(state, T0 - 5_000)).toBe(0);
  });
});

describe('applyClockAction', () => {
  it('KICKOFF starts a scheduled match live with a running clock', () => {
    const next = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(next).toEqual({
      status: 'LIVE',
      periodStartedAt: new Date(T0).toISOString(),
      pausedElapsedMs: 0,
      currentPeriod: 1,
    });
  });

  it('PAUSE banks elapsed time and stops the clock', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const next = applyClockAction(live, { action: 'PAUSE' }, T0 + 120_000, 3);
    expect(next.status).toBe('PAUSED');
    expect(next.periodStartedAt).toBeNull();
    expect(next.pausedElapsedMs).toBe(120_000);
  });

  it('RESUME restarts the clock without losing banked time', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const paused = applyClockAction(live, { action: 'PAUSE' }, T0 + 120_000, 3);
    const resumed = applyClockAction(paused, { action: 'RESUME' }, T0 + 300_000, 3);
    expect(resumed.status).toBe('LIVE');
    expect(resumed.pausedElapsedMs).toBe(120_000);
    expect(deriveElapsedMs(resumed, T0 + 330_000)).toBe(150_000);
  });

  it('END completes the match and banks the final time', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const done = applyClockAction(live, { action: 'END' }, T0 + 2_700_000, 3);
    expect(done.status).toBe('COMPLETED');
    expect(done.periodStartedAt).toBeNull();
    expect(done.pausedElapsedMs).toBe(2_700_000);
  });

  it('END also works from PAUSED', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const paused = applyClockAction(live, { action: 'PAUSE' }, T0 + 100_000, 3);
    const done = applyClockAction(paused, { action: 'END' }, T0 + 900_000, 3);
    expect(done.status).toBe('COMPLETED');
    expect(done.pausedElapsedMs).toBe(100_000);
  });

  it('ABANDON is allowed from SCHEDULED, LIVE and PAUSED', () => {
    expect(applyClockAction(scheduled, { action: 'ABANDON' }, T0, 3).status).toBe('ABANDONED');
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(applyClockAction(live, { action: 'ABANDON' }, T0 + 1_000, 3).status).toBe('ABANDONED');
  });

  it('SET_PERIOD updates the period within bounds and keeps the clock running', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const p2 = applyClockAction(live, { action: 'SET_PERIOD', period: 2 }, T0 + 10, 3);
    expect(p2.currentPeriod).toBe(2);
    expect(p2.status).toBe('LIVE');
    expect(p2.periodStartedAt).toBe(live.periodStartedAt);
  });

  it('rejects SET_PERIOD out of range or without a period', () => {
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    expect(() => applyClockAction(live, { action: 'SET_PERIOD', period: 4 }, T0, 3)).toThrow(
      ClockTransitionError,
    );
    expect(() => applyClockAction(live, { action: 'SET_PERIOD' }, T0, 3)).toThrow(
      ClockTransitionError,
    );
  });

  it('rejects invalid transitions with a readable message', () => {
    expect(() => applyClockAction(scheduled, { action: 'PAUSE' }, T0, 3)).toThrow(
      ClockTransitionError,
    );
    const live = applyClockAction(scheduled, { action: 'KICKOFF' }, T0, 3);
    const done = applyClockAction(live, { action: 'END' }, T0 + 1, 3);
    expect(() => applyClockAction(done, { action: 'RESUME' }, T0 + 2, 3)).toThrow(/completed/i);
    expect(() => applyClockAction(live, { action: 'KICKOFF' }, T0 + 1, 3)).toThrow(
      ClockTransitionError,
    );
  });
});

describe('canRecordInteractive', () => {
  it('allows LIVE and PAUSED only', () => {
    expect(canRecordInteractive('LIVE')).toBe(true);
    expect(canRecordInteractive('PAUSED')).toBe(true);
    expect(canRecordInteractive('SCHEDULED')).toBe(false);
    expect(canRecordInteractive('COMPLETED')).toBe(false);
    expect(canRecordInteractive('ABANDONED')).toBe(false);
  });
});
