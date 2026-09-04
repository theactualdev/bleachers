/**
 * Match lifecycle + clock as pure state transitions.
 *
 * The clock is never a counter — it is derived from wall-clock timestamps, so
 * a page reload, a locked phone, or a throttled background tab cannot lose or
 * drift time. `pausedElapsedMs` banks time while stopped; `periodStartedAt`
 * marks when the clock last started running (null = stopped). The clock is
 * cumulative across periods.
 */

export type MatchLifecycleStatus = 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';

export interface MatchClockState {
  status: MatchLifecycleStatus;
  periodStartedAt: string | null;
  pausedElapsedMs: number;
  currentPeriod: number;
}

export type ClockActionInput = {
  action: 'KICKOFF' | 'PAUSE' | 'RESUME' | 'END' | 'ABANDON' | 'SET_PERIOD';
  period?: number;
};

export class ClockTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClockTransitionError';
  }
}

export function deriveElapsedMs(
  state: Pick<MatchClockState, 'periodStartedAt' | 'pausedElapsedMs'>,
  nowMs: number,
): number {
  if (!state.periodStartedAt) return state.pausedElapsedMs;
  const running = nowMs - Date.parse(state.periodStartedAt);
  return state.pausedElapsedMs + Math.max(0, running);
}

/** Bank whatever is on the clock and stop it. */
function stopped(
  state: MatchClockState,
  nowMs: number,
): Pick<MatchClockState, 'periodStartedAt' | 'pausedElapsedMs'> {
  return { periodStartedAt: null, pausedElapsedMs: deriveElapsedMs(state, nowMs) };
}

export function applyClockAction(
  state: MatchClockState,
  input: ClockActionInput,
  nowMs: number,
  maxPeriod: number,
): MatchClockState {
  const fail = (msg: string): never => {
    throw new ClockTransitionError(msg);
  };

  switch (input.action) {
    case 'KICKOFF':
      if (state.status !== 'SCHEDULED')
        fail(`Cannot kick off a ${state.status.toLowerCase()} match`);
      return {
        status: 'LIVE',
        periodStartedAt: new Date(nowMs).toISOString(),
        pausedElapsedMs: 0,
        currentPeriod: 1,
      };

    case 'PAUSE':
      if (state.status !== 'LIVE') fail(`Cannot pause a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'PAUSED', ...stopped(state, nowMs) };

    case 'RESUME':
      if (state.status !== 'PAUSED') fail(`Cannot resume a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'LIVE', periodStartedAt: new Date(nowMs).toISOString() };

    case 'END':
      if (state.status !== 'LIVE' && state.status !== 'PAUSED')
        fail(`Cannot end a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'COMPLETED', ...stopped(state, nowMs) };

    case 'ABANDON':
      if (state.status === 'COMPLETED' || state.status === 'ABANDONED')
        fail(`Cannot abandon a ${state.status.toLowerCase()} match`);
      return { ...state, status: 'ABANDONED', ...stopped(state, nowMs) };

    case 'SET_PERIOD': {
      if (state.status !== 'LIVE' && state.status !== 'PAUSED')
        fail(`Cannot change period of a ${state.status.toLowerCase()} match`);
      const p = input.period;
      if (p === undefined || !Number.isInteger(p) || p < 1 || p > maxPeriod)
        fail(`Period must be between 1 and ${maxPeriod}`);
      return { ...state, currentPeriod: p as number };
    }
  }
}

/** Interactive recording (live screen taps + undo) is only valid mid-match. */
export function canRecordInteractive(status: MatchLifecycleStatus): boolean {
  return status === 'LIVE' || status === 'PAUSED';
}
