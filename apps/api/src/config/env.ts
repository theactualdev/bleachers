/** Centralised, typed access to environment configuration. */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  directUrl: string;
  webOrigins: string[];
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
    port: Number(process.env.API_PORT ?? '4000'),
    databaseUrl: process.env.DATABASE_URL ?? '',
    directUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
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
