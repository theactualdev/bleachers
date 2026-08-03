import { afterEach, describe, expect, it } from 'vitest';
import { HealthController } from '../src/health.controller.js';
import { env, loadEnv } from '../src/config/env.js';

describe('health', () => {
  const originalSha = env.commitSha;
  const originalRailway = process.env.RAILWAY_GIT_COMMIT_SHA;

  afterEach(() => {
    env.commitSha = originalSha;
    if (originalRailway === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = originalRailway;
  });

  it('reports the deployed commit alongside status', () => {
    env.commitSha = 'abc123def456';
    expect(new HealthController().check()).toEqual({
      status: 'ok',
      service: 'bleachers-api',
      commit: 'abc123def456',
    });
  });

  it('trims the Railway SHA to 12 chars, matching the web build stamp', () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = '14b77ebb81f3aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(loadEnv().commitSha).toBe('14b77ebb81f3');
  });

  it('falls back to "unknown" rather than an empty string off-platform', () => {
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    expect(loadEnv().commitSha).toBe('unknown');
  });
});
