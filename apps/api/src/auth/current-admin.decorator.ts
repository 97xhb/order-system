import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAdminRequest } from './auth.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedAdminRequest>().admin,
);

export const CurrentAdminSessionId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedAdminRequest>()
      .adminSessionId,
);
