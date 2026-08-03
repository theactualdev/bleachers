import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.decorators.js';
import { env } from './config/env.js';

@Public()
@Controller('health')
export class HealthController {
  /**
   * Railway's health check target, and the way to confirm which build is live:
   * `commit` is the deployed SHA, so "did my push actually deploy?" is one curl
   * rather than a dashboard visit. It stays deliberately cheap — no database
   * round-trip, since a health check that touches the DB turns a brief pooler
   * blip into a failed deploy.
   */
  @Get()
  check() {
    return { status: 'ok', service: 'bleachers-api', commit: env.commitSha };
  }
}
