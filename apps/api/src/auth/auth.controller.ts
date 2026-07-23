import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './auth.decorators.js';
import type { AuthUser } from './auth.types.js';

@Controller()
export class AuthController {
  /** Returns the currently authenticated user (Supabase Bearer JWT resolved by AuthGuard). */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
