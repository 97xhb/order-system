import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MIN_ADMIN_PASSWORD_LENGTH } from './auth.constants';
import { hashPassword } from './password';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if ((await this.prisma.adminUser.count()) > 0) return;

    const username = this.config
      .get<string>('ADMIN_USERNAME', 'admin')
      .trim()
      .toLowerCase();
    const displayName = this.config
      .get<string>('ADMIN_DISPLAY_NAME', '管理员')
      .trim();
    const initialPassword = this.config.get<string>('ADMIN_INITIAL_PASSWORD');

    if (!/^[a-z0-9._-]{1,64}$/.test(username)) {
      throw new Error(
        'ADMIN_USERNAME 只能包含小写字母、数字、点、下划线和短横线',
      );
    }
    if (!displayName || displayName.length > 100) {
      throw new Error('ADMIN_DISPLAY_NAME 长度必须在 1 到 100 之间');
    }
    if (
      !initialPassword ||
      initialPassword === 'replace_with_a_strong_unique_password' ||
      initialPassword.startsWith('CHANGE_ME_') ||
      initialPassword.length < MIN_ADMIN_PASSWORD_LENGTH
    ) {
      throw new Error(
        `首次启动时 ADMIN_INITIAL_PASSWORD 必须替换示例值，且至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符`,
      );
    }

    try {
      await this.prisma.adminUser.create({
        data: {
          username,
          displayName,
          passwordHash: await hashPassword(initialPassword),
        },
      });
      this.logger.log(`已创建初始管理员账号：${username}`);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }
}
