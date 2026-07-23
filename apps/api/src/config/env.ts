/** Centralised, typed access to environment configuration. */
export interface AppEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  webOrigins: string[];
  google: { clientId: string; clientSecret: string } | null;
  smtp: { host: string; port: number; user: string; password: string; from: string } | null;
}

export function loadEnv(): AppEnv {
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : null;

  const smtp =
    process.env.SMTP_HOST && process.env.SMTP_USER
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? '587'),
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD ?? '',
          from: process.env.EMAIL_FROM ?? 'Bleachers <no-reply@bleachers.app>',
        }
      : null;

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.API_PORT ?? '4000'),
    databaseUrl: process.env.DATABASE_URL ?? '',
    betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-change-me',
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    google,
    smtp,
  };
}

export const env = loadEnv();
