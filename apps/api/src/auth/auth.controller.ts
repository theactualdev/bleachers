import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './auth.decorators.js';
import type { AuthUser } from './auth.types.js';

@Controller()
export class AuthController {
  /** Returns the currently authenticated user (Better Auth session resolved by AuthGuard). */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
