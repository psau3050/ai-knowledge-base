import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service.js';
import { IS_PUBLIC } from './auth.decorators.js';
import type { AuthenticatedRequest } from './user-context.js';

/**
 * Global guard: every route needs a valid Supabase access token unless marked @Public().
 * Rejecting early matters beyond the database: without it, an anonymous caller could still spend
 * AI provider tokens before RLS ever got involved.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    const userId = await this.supabase.verifyAccessToken(token);
    if (!userId) throw new UnauthorizedException('Invalid or expired token');

    request.userContext = { userId, db: this.supabase.forUser(token) };
    return true;
  }
}
