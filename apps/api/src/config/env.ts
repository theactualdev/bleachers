/** Centralised, typed access to environment configuration. */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  directUrl: string;
  webOrigins: string[];
  /** Pre-launch allowlist; empty means the API is open to any valid session. */
  allowedEmails: string[];
  supabase: {
    url: string;
    jwksUrl: string;
    issuer: string;
    serviceRoleKey: string;
  };
}

export function loadEnv(): AppEnv {
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    // API_PORT for local dev; PORT is what hosts like Railway inject at runtime.
    port: Number(process.env.API_PORT ?? process.env.PORT ?? '4000'),
    databaseUrl: process.env.DATABASE_URL ?? '',
    directUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
    // Browsers never send a trailing slash in the Origin header — strip any from
    // config so a pasted URL like "https://app.example.com/" still matches.
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    // Pre-launch lockdown. When non-empty, only these addresses may use the API
    // at all — a valid Supabase session for anyone else is rejected. Empty (the
    // default) means open, so tests and local dev are unaffected.
    allowedEmails: (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    supabase: {
      url: supabaseUrl,
      jwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      issuer: `${supabaseUrl}/auth/v1`,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  };
}

export const env = loadEnv();
