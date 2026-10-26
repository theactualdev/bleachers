import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Warms the connection without letting boot wait on it. Prisma connects on
   * the first query anyway, so an unreachable database should cost failed
   * requests, not the process: with app sleeping on, every Railway wake is a
   * fresh boot, and a boot that threw here crash-looped through ON_FAILURE's
   * retries and left the domain with no deployment until the next push.
   * Migrations still gate deploys — `prisma migrate deploy` runs pre-deploy.
   */
  onModuleInit(): void {
    this.$connect().catch((e: unknown) => {
      this.logger.warn(
        `Database unreachable at boot; serving anyway, queries will retry the connection. ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
