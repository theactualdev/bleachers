import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession } } }));

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
});
