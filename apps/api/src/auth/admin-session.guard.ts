import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DEFAULT_ADMIN_SESSION_COOKIE } from './auth.constants';
import type { AuthenticatedAdminRequest } from './auth.types';
import { AuthService } from './auth.service';
import { readCookie } from './cookie';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieName = this.config.get<string>(
      'ADMIN_SESSION_COOKIE',
      DEFAULT_ADMIN_SESSION_COOKIE,
    );
    const token = readCookie(request, cookieName);

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    const session = await this.authService.validateSession(
      token,
      request.get('x-device-id')?.trim().slice(0, 200),
      request.get('x-device-fingerprint')?.trim().slice(0, 500),
    );
    const authenticatedRequest = request as AuthenticatedAdminRequest;
    authenticatedRequest.admin = session.admin;
    authenticatedRequest.adminSessionId = session.sessionId;

    return true;
  }
}
