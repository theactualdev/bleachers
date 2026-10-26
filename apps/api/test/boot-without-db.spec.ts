import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * A database outage must cost failed requests, never the process. With app
 * sleeping on, every Railway wake is a fresh boot; a boot that threw on the
 * Prisma connect crash-looped through ON_FAILURE's five retries and left the
 * domain answering "Application not found" until the next deploy.
 *
 * No database is involved: the URL points at a port nothing listens on.
 */
describe('booting with the database unreachable', () => {
  const originalUrl = process.env.DATABASE_URL;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none';
    // Imported after the override so PrismaClient is constructed against it.
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('still serves /health', async () => {
    const res = await request(app!.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('fails a database-backed request without taking the process down', async () => {
    const res = await request(app!.getHttpServer()).get(
      '/api/public/matches/20000000-0000-4000-8000-000000000001',
    );
    expect(res.status).toBe(500);

    const after = await request(app!.getHttpServer()).get('/health');
    expect(after.status).toBe(200);
  });
});
