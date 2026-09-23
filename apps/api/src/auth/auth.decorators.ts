import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, UserContext } from './user-context.js';

export const IS_PUBLIC = 'isPublic';

/** Opts a route out of the global AuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the caller's UserContext, set by AuthGuard. */
export const Ctx = createParamDecorator((_: unknown, context: ExecutionContext): UserContext => {
  const { userContext } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!userContext) throw new Error('@Ctx() used on a route that AuthGuard did not authenticate');
  return userContext;
});
