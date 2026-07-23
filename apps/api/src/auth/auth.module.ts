import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH, createAuth } from './auth.instance.js';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      useFactory: (prisma: PrismaService) => createAuth(prisma),
      inject: [PrismaService],
    },
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
  exports: [AUTH, AuthGuard],
})
export class AuthModule {}
