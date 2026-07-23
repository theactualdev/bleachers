import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module.js';
import { AUTH, type Auth } from './auth/auth.instance.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  // bodyParser is disabled so the Better Auth handler can read the raw request body; we add the
  // JSON parser back for every other route immediately after mounting it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  app.enableCors({
    origin: env.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const auth = app.get<Auth>(AUTH);
  const server = app.getHttpAdapter().getInstance();

  // Better Auth owns everything under /api/auth/* (magic link, OAuth, session, sign-out).
  server.all('/api/auth/*', toNodeHandler(auth));

  // JSON body parsing for the rest of the API.
  server.use(express.json({ limit: '2mb' }));
  server.use(express.urlencoded({ extended: true }));

  app.setGlobalPrefix('api', { exclude: ['health'] });

  await app.listen(env.port);
  new Logger('Bootstrap').log(`Bleachers API listening on http://localhost:${env.port}`);
}

void bootstrap();
