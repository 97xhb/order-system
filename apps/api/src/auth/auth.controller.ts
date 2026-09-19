import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ADMIN_LOGIN_RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../security/rate-limit.constants';
import {
  ADMIN_SESSION_COOKIE_PATH,
  DEFAULT_ADMIN_SESSION_COOKIE,
} from './auth.constants';
import { AdminSessionGuard } from './admin-session.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedAdmin } from './auth.types';
import { CurrentAdmin, CurrentAdminSessionId } from './current-admin.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private getCookieName() {
    return this.config.get<string>(
      'ADMIN_SESSION_COOKIE',
      DEFAULT_ADMIN_SESSION_COOKIE,
    );
  }

  private getCookieOptions(expires?: Date) {
    const secureSetting = this.config.get<string>(
      'ADMIN_COOKIE_SECURE',
      'auto',
    );
    const webOrigin = this.config.get<string>('WEB_ORIGIN', '');
    const secure =
      secureSetting === 'true' ||
      (secureSetting === 'auto' &&
        webOrigin
          .split(',')
          .some((origin) => origin.trim().startsWith('https://')));

    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: ADMIN_SESSION_COOKIE_PATH,
      expires,
    };
  }

  private getRequestMetadata(request: Request) {
    const encodedDeviceName = request.get('x-device-name')?.slice(0, 500);
    let deviceName = encodedDeviceName;
    if (encodedDeviceName) {
      try {
        deviceName = decodeURIComponent(encodedDeviceName);
      } catch {
        deviceName = encodedDeviceName;
      }
    }

    return {
      ipAddress: request.ip?.slice(0, 64),
      userAgent: request.get('user-agent')?.slice(0, 2_000),
      deviceId: request.get('x-device-id')?.trim().slice(0, 200),
      deviceFingerprint: request
        .get('x-device-fingerprint')
        ?.trim()
        .slice(0, 500),
      deviceName,
    };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({
    default: {
      limit: ADMIN_LOGIN_RATE_LIMIT_REQUESTS,
      ttl: RATE_LIMIT_WINDOW_MS,
    },
  })
  @ApiOperation({ summary: '管理员登录' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      dto.username,
      dto.password,
      this.getRequestMetadata(request),
    );

    response.cookie(
      this.getCookieName(),
      result.token,
      this.getCookieOptions(result.expiresAt),
    );

    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Get('me')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '获取当前管理员' })
  getMe(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return { user: admin };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '退出当前管理员会话' })
  async logout(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @CurrentAdminSessionId() sessionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(sessionId, admin);
    response.clearCookie(this.getCookieName(), this.getCookieOptions());
  }

  @Patch('password')
  @HttpCode(204)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: '修改管理员密码并注销其他会话' })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @CurrentAdminSessionId() sessionId: string,
  ) {
    await this.authService.changePassword(
      admin,
      sessionId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
