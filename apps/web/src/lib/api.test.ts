import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));

const { setMockOrgId, getMockOrgId } = vi.hoisted(() => {
  let mockOrgId: string | null = null;
  return {
    setMockOrgId: (id: string | null) => {
      mockOrgId = id;
    },
    getMockOrgId: () => mockOrgId,
  };
});
vi.mock('./org-store', () => ({
  useOrgStore: { getState: () => ({ activeOrgId: getMockOrgId() }) },
}));

import { apiGet } from './api';

describe('api() bearer token', () => {
  beforeEach(() => {
    getSession.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  it('attaches the Supabase access token as a Bearer header', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    await apiGet('/api/me');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('omits the header when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await apiGet('/api/me');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('attaches the active org id header when set', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    setMockOrgId('11111111-1111-4111-8111-111111111111');
    await apiGet('/api/teams');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init.headers as Record<string, string>)['X-Organization-Id']).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('omits the org header when no active org', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    setMockOrgId(null);
    await apiGet('/api/me');
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((init.headers as Record<string, string>)['X-Organization-Id']).toBeUndefined();
  });
});
