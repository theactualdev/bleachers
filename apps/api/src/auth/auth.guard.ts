import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { env } from '../config/env.js';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { JWT_VERIFIER } from './auth.tokens.js';
import type { JwtVerifier } from './supabase-jwt.js';

/**
 * Global guard. Verifies the Supabase access token from the Authorization: Bearer
 * header and attaches the user to the request. Routes marked `@Public()` bypass it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWT_VERIFIER) private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Authentication required');

    let user;
    try {
      user = await this.verifier.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Pre-launch allowlist. Enforced here rather than in the browser because the
    // Supabase anon key is public — anyone can mint a session against the auth
    // endpoint directly, so a client-side check gates nothing. This is the line
    // that actually holds.
    const allowed = env.allowedEmails;
    if (allowed.length > 0 && !allowed.includes((user.email ?? '').toLowerCase())) {
      throw new ForbiddenException('Bleachers is not open yet.');
    }

    request.user = user;
    return true;
  }
}
