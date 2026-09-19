import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutMethodStatus, PayoutMethodType, Prisma } from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveValue,
} from '../security/sensitive-value';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { CreateSubmitterDto } from './dto/create-submitter.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { UpdateSubmitterDto } from './dto/update-submitter.dto';

@Injectable()
export class SubmittersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private clean(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private encryptionKey() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  private assertSupportedPayoutMethod(type: PayoutMethodType) {
    const supportedTypes: PayoutMethodType[] = [
      PayoutMethodType.WECHAT,
      PayoutMethodType.ALIPAY,
      PayoutMethodType.BANK_CARD,
    ];
    if (!supportedTypes.includes(type)) {
      throw new BadRequestException(
        '回款方式仅支持微信转账、支付宝和银行卡转账',
      );
    }
  }

  private payoutMethodLabel(type: PayoutMethodType) {
    const labels: Record<string, string> = {
      [PayoutMethodType.WECHAT]: '微信转账',
      [PayoutMethodType.ALIPAY]: '支付宝',
      [PayoutMethodType.BANK_CARD]: '银行卡转账',
    };
    return labels[type] ?? '回款方式';
  }

  private payoutMethodView<T extends { accountValueEncrypted: string | null }>(
    method: T,
  ) {
    let accountMasked: string | null = null;
    if (method.accountValueEncrypted) {
      try {
        accountMasked = maskSensitiveValue(
          decryptSensitiveValue(
            method.accountValueEncrypted,
            this.encryptionKey(),
          ),
        );
      } catch {
        accountMasked = '加密数据不可读';
      }
    }

    const { accountValueEncrypted: _hidden, ...safeMethod } = method;
    return { ...safeMethod, accountMasked };
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    admin: AuthenticatedAdmin,
    action: string,
    entityType: string,
    entityId: string,
    beforeData?: Prisma.InputJsonValue,
    afterData?: Prisma.InputJsonValue,
  ) {
    await transaction.auditLog.create({
      data: {
        actorAdminId: admin.id,
        source: 'ADMIN_WEB',
        action,
        entityType,
        entityId,
        beforeData,
        afterData,
      },
    });
  }

  private throwConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('下单人识别码已经存在');
    }
    throw error;
  }

  async list(includeDisabled = false) {
    const items = await this.prisma.submitter.findMany({
      where: includeDisabled ? undefined : { status: 'ACTIVE' },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      include: {
        payoutMethods: {
          where: {
            deletedAt: null,
            ...(includeDisabled ? {} : { status: PayoutMethodStatus.ACTIVE }),
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          include: { _count: { select: { payouts: true } } },
        },
        _count: {
          select: {
            orders: { where: { deletedAt: null } },
            payouts: true,
            externalIdentities: true,
          },
        },
      },
    });

    return items.map((item) => ({
      ...item,
      payoutMethods: item.payoutMethods.map((method) =>
        this.payoutMethodView(method),
      ),
    }));
  }

  async create(dto: CreateSubmitterDto, admin: AuthenticatedAdmin) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('下单人名称不能为空');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const submitter = await transaction.submitter.create({
          data: {
            name,
            nickname: this.clean(dto.nickname),
            phone: this.clean(dto.phone),
            wechatId: this.clean(dto.wechatId),
            status: dto.status,
            notes: this.clean(dto.notes),
          },
        });
        await this.audit(
          transaction,
          admin,
          'CREATE',
          'Submitter',
          submitter.id,
          undefined,
          {
            code: submitter.code,
            name: submitter.name,
            nickname: submitter.nickname,
            phone: submitter.phone,
            wechatId: submitter.wechatId,
            status: submitter.status,
          },
        );
        return submitter;
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async update(id: string, dto: UpdateSubmitterDto, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.submitter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('下单人不存在');
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('下单人名称不能为空');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const submitter = await transaction.submitter.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            nickname:
              dto.nickname === undefined ? undefined : this.clean(dto.nickname),
            phone: dto.phone === undefined ? undefined : this.clean(dto.phone),
            wechatId:
              dto.wechatId === undefined ? undefined : this.clean(dto.wechatId),
            status: dto.status,
            notes: dto.notes === undefined ? undefined : this.clean(dto.notes),
          },
        });
        await this.audit(
          transaction,
          admin,
          'UPDATE',
          'Submitter',
          id,
          {
            code: existing.code,
            name: existing.name,
            nickname: existing.nickname,
            phone: existing.phone,
            wechatId: existing.wechatId,
            status: existing.status,
          },
          {
            code: submitter.code,
            name: submitter.name,
            nickname: submitter.nickname,
            phone: submitter.phone,
            wechatId: submitter.wechatId,
            status: submitter.status,
          },
        );
        return submitter;
      });
    } catch (error) {
      this.throwConflict(error);
    }
  }

  async remove(id: string, admin: AuthenticatedAdmin) {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.submitter.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              payoutMethods: true,
              externalIdentities: true,
              orders: { where: { deletedAt: null } },
              payouts: true,
            },
          },
        },
      });
      if (!existing) throw new NotFoundException('下单人不存在');

      if (existing._count.orders > 0 || existing._count.payouts > 0) {
        throw new ConflictException(
          '下单人仍有有效订单或回款记录，请先处理后再删除',
        );
      }

      const protectedDeletedOrder = await transaction.order.findFirst({
        where: {
          submitterId: id,
          deletedAt: { not: null },
          OR: [{ receiptLinks: { some: {} } }, { payoutLinks: { some: {} } }],
        },
        select: { id: true },
      });
      if (protectedDeletedOrder) {
        throw new ConflictException(
          '已删除订单仍有关联收付款记录，不能删除下单人',
        );
      }

      const deletedOrders = await transaction.order.deleteMany({
        where: { submitterId: id, deletedAt: { not: null } },
      });
      await transaction.submitter.delete({ where: { id } });
      await this.audit(transaction, admin, 'DELETE', 'Submitter', id, {
        code: existing.code,
        name: existing.name,
        status: existing.status,
        purgedDeletedOrderCount: deletedOrders.count,
        unlinkedExternalIdentityCount: existing._count.externalIdentities,
      });
    });
  }

  async createPayoutMethod(
    submitterId: string,
    dto: CreatePayoutMethodDto,
    admin: AuthenticatedAdmin,
  ) {
    if (
      !(await this.prisma.submitter.findUnique({ where: { id: submitterId } }))
    ) {
      throw new NotFoundException('下单人不存在');
    }
    this.assertSupportedPayoutMethod(dto.type);
    const accountValue = this.clean(dto.accountValue);
    const accountName = this.clean(dto.accountName);
    const bankName = this.clean(dto.bankName);

    if (dto.type === PayoutMethodType.ALIPAY && !accountValue) {
      throw new BadRequestException('请填写支付宝账号');
    }
    if (dto.type === PayoutMethodType.BANK_CARD) {
      if (!accountValue) throw new BadRequestException('请填写银行卡号');
      if (!accountName) throw new BadRequestException('请填写银行卡真实姓名');
      if (!bankName) throw new BadRequestException('请填写开户银行');
    }

    return this.prisma.$transaction(async (transaction) => {
      if (dto.isDefault) {
        await transaction.payoutMethod.updateMany({
          where: { submitterId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const method = await transaction.payoutMethod.create({
        data: {
          submitterId,
          type: dto.type,
          label: this.payoutMethodLabel(dto.type),
          accountName:
            dto.type === PayoutMethodType.BANK_CARD ? accountName : null,
          accountValueEncrypted:
            dto.type === PayoutMethodType.WECHAT || !accountValue
              ? null
              : encryptSensitiveValue(accountValue, this.encryptionKey()),
          bankName: dto.type === PayoutMethodType.BANK_CARD ? bankName : null,
          isDefault: dto.isDefault ?? false,
          status: dto.status ?? PayoutMethodStatus.ACTIVE,
        },
        include: { _count: { select: { payouts: true } } },
      });
      await this.audit(
        transaction,
        admin,
        'CREATE',
        'PayoutMethod',
        method.id,
        undefined,
        {
          submitterId,
          type: method.type,
          label: method.label,
          accountMasked: accountValue ? maskSensitiveValue(accountValue) : null,
          isDefault: method.isDefault,
          status: method.status,
        },
      );
      return this.payoutMethodView(method);
    });
  }

  async updatePayoutMethod(
    id: string,
    dto: UpdatePayoutMethodDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.payoutMethod.findUnique({
      where: { id },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('收款方式不存在');
    }
    const targetType = dto.type ?? existing.type;
    this.assertSupportedPayoutMethod(targetType);
    const typeChanged = targetType !== existing.type;
    const requestedAccountValue =
      dto.accountValue === undefined ? undefined : this.clean(dto.accountValue);

    let accountName: string | null | undefined;
    let bankName: string | null | undefined;
    let accountValueEncrypted: string | null | undefined;

    if (targetType === PayoutMethodType.WECHAT) {
      accountName = null;
      bankName = null;
      accountValueEncrypted = null;
    } else if (targetType === PayoutMethodType.ALIPAY) {
      const hasSavedAccount =
        !typeChanged && Boolean(existing.accountValueEncrypted);
      if (!requestedAccountValue && !hasSavedAccount) {
        throw new BadRequestException('请填写支付宝账号');
      }
      accountName = null;
      bankName = null;
      accountValueEncrypted = requestedAccountValue
        ? encryptSensitiveValue(requestedAccountValue, this.encryptionKey())
        : undefined;
    } else {
      accountName =
        dto.accountName === undefined
          ? typeChanged
            ? null
            : existing.accountName
          : this.clean(dto.accountName);
      bankName =
        dto.bankName === undefined
          ? typeChanged
            ? null
            : existing.bankName
          : this.clean(dto.bankName);
      const hasSavedCard =
        !typeChanged && Boolean(existing.accountValueEncrypted);

      if (!requestedAccountValue && !hasSavedCard) {
        throw new BadRequestException('请填写银行卡号');
      }
      if (!accountName) throw new BadRequestException('请填写银行卡真实姓名');
      if (!bankName) throw new BadRequestException('请填写开户银行');

      accountValueEncrypted = requestedAccountValue
        ? encryptSensitiveValue(requestedAccountValue, this.encryptionKey())
        : undefined;
    }

    return this.prisma.$transaction(async (transaction) => {
      if (dto.isDefault) {
        await transaction.payoutMethod.updateMany({
          where: { submitterId: existing.submitterId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      const method = await transaction.payoutMethod.update({
        where: { id },
        data: {
          type: targetType,
          label: this.payoutMethodLabel(targetType),
          accountName,
          accountValueEncrypted,
          bankName,
          isDefault: dto.isDefault,
          status: dto.status,
        },
        include: { _count: { select: { payouts: true } } },
      });
      await this.audit(
        transaction,
        admin,
        'UPDATE',
        'PayoutMethod',
        id,
        {
          type: existing.type,
          label: existing.label,
          isDefault: existing.isDefault,
          status: existing.status,
        },
        {
          type: method.type,
          label: method.label,
          accountMasked:
            requestedAccountValue === undefined
              ? undefined
              : requestedAccountValue
                ? maskSensitiveValue(requestedAccountValue)
                : null,
          isDefault: method.isDefault,
          status: method.status,
        },
      );
      return this.payoutMethodView(method);
    });
  }

  async getPayoutMethodAccountValue(id: string) {
    const method = await this.prisma.payoutMethod.findUnique({ where: { id } });
    if (!method || method.deletedAt) {
      throw new NotFoundException('回款方式不存在');
    }
    if (!method.accountValueEncrypted) return { accountValue: null };

    try {
      return {
        accountValue: decryptSensitiveValue(
          method.accountValueEncrypted,
          this.encryptionKey(),
        ),
      };
    } catch {
      throw new BadRequestException('回款账号暂时无法读取，请重新编辑保存');
    }
  }

  async removePayoutMethod(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.payoutMethod.findUnique({
      where: { id },
      include: { _count: { select: { payouts: true } } },
    });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('收款方式不存在');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.payoutMethod.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isDefault: false,
          status: PayoutMethodStatus.DISABLED,
        },
      });
      await this.audit(transaction, admin, 'DELETE', 'PayoutMethod', id, {
        type: existing.type,
        label: existing.label,
        isDefault: existing.isDefault,
        status: existing.status,
        payoutCount: existing._count.payouts,
      });
    });
  }
}
