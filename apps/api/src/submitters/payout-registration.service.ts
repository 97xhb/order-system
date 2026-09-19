import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExternalIdentityStatus,
  CustomFieldScope,
  OrderStatus,
  PayoutMethodStatus,
  PayoutMethodType,
  Prisma,
  SettlementStatus,
  SubmitterStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import {
  assertNicknameCanBeClaimed,
  throwSubmitterNicknameConflict,
} from '../identity/submitter-nickname';
import type { ResolvedPublicIdentity } from '../public-forms/public-identity.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveValue,
} from '../security/sensitive-value';
import {
  CreatePublicPayoutRegistrationDto,
  PublicPayoutRegistrationMethodDto,
} from './dto/create-public-payout-registration.dto';
import { LookupPayoutHistoryDto } from './dto/lookup-payout-history.dto';
import {
  buildPayoutQueryFieldOptions,
  normalizePayoutQueryFields,
  normalizePayoutQueryLockedFields,
  publicPayoutQueryFieldOptions,
  type PayoutQueryFieldOption,
  type PayoutQueryFieldKey,
} from './payout-query-fields';

const PAYOUT_FORM_ID = '00000000-0000-0000-0000-000000000001';

interface PublicRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class PayoutRegistrationService {
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

  private token() {
    return randomBytes(32).toString('base64url');
  }

  private methodLabel(type: PayoutMethodType) {
    if (type === PayoutMethodType.WECHAT) return '微信转账';
    if (type === PayoutMethodType.ALIPAY) return '支付宝';
    return '银行卡转账';
  }

  private auditReason(afterData: Prisma.JsonValue | null) {
    if (
      !afterData ||
      typeof afterData !== 'object' ||
      Array.isArray(afterData)
    ) {
      return null;
    }
    const reason = (afterData as Prisma.JsonObject).reason;
    return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  }

  private async ensureForm() {
    return this.prisma.payoutRegistrationForm.upsert({
      where: { id: PAYOUT_FORM_ID },
      update: {},
      create: {
        id: PAYOUT_FORM_ID,
        publicToken: this.token(),
        enabled: true,
        lookupPublicToken: this.token(),
        lookupEnabled: true,
      },
    });
  }

  private formView(form: {
    id: string;
    publicToken: string;
    enabled: boolean;
    updatedAt: Date;
  }) {
    return {
      id: form.id,
      publicToken: form.publicToken,
      path: `/payout/${form.publicToken}`,
      enabled: form.enabled,
      updatedAt: form.updatedAt,
    };
  }

  async getAdminForm() {
    return this.formView(await this.ensureForm());
  }

  private async payoutQueryFieldOptions(): Promise<PayoutQueryFieldOption[]> {
    // 部分单元测试使用精简 Prisma mock；没有自定义字段 delegate 时仍回退到基础列。
    const delegate = (
      this.prisma as unknown as {
        customFieldDefinition?: {
          findMany?: (args: unknown) => Promise<
            Array<{
              id: string;
              label: string;
              type: string;
              showInTable: boolean;
              externallyVisible: boolean;
            }>
          >;
        };
      }
    ).customFieldDefinition;
    if (!delegate?.findMany) return buildPayoutQueryFieldOptions();

    const customFields = await delegate.findMany({
      where: { scope: CustomFieldScope.ORDER, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        label: true,
        type: true,
        showInTable: true,
        externallyVisible: true,
      },
    });
    return buildPayoutQueryFieldOptions(customFields);
  }

  private async lookupFormView(
    form: {
      id: string;
      lookupPublicToken: string;
      lookupEnabled: boolean;
      lookupVisibleFields: Prisma.JsonValue | null;
      lookupLockedFields?: Prisma.JsonValue | null;
      updatedAt: Date;
    },
    fieldOptions?: readonly PayoutQueryFieldOption[],
  ) {
    const options = fieldOptions ?? (await this.payoutQueryFieldOptions());
    const lockedFields = normalizePayoutQueryLockedFields(
      form.lookupLockedFields,
      options,
    );
    return {
      id: form.id,
      publicToken: form.lookupPublicToken,
      path: `/order-query/${form.lookupPublicToken}`,
      enabled: form.lookupEnabled,
      visibleFields: normalizePayoutQueryFields(
        form.lookupVisibleFields,
        options,
        lockedFields,
      ),
      lockedFields,
      fieldOptions: options,
      updatedAt: form.updatedAt,
    };
  }

  async getAdminLookupForm() {
    return this.lookupFormView(await this.ensureForm());
  }

  async updateEnabled(enabled: boolean, admin: AuthenticatedAdmin) {
    const existing = await this.ensureForm();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const form = await transaction.payoutRegistrationForm.update({
        where: { id: existing.id },
        data: { enabled },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: enabled
            ? 'PAYOUT_REGISTRATION_FORM_ENABLED'
            : 'PAYOUT_REGISTRATION_FORM_DISABLED',
          entityType: 'PayoutRegistrationForm',
          entityId: form.id,
          beforeData: { enabled: existing.enabled },
          afterData: { enabled: form.enabled },
        },
      });
      return form;
    });
    return this.formView(updated);
  }

  async updateLookupSettings(
    settings: {
      enabled?: boolean;
      visibleFields?: string[];
      lockedFields?: string[];
    },
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.ensureForm();
    const fieldOptions = await this.payoutQueryFieldOptions();
    const hasEnabled = typeof settings.enabled === 'boolean';
    const hasVisibleFields = settings.visibleFields !== undefined;
    const hasLockedFields = settings.lockedFields !== undefined;
    const existingLockedFields = normalizePayoutQueryLockedFields(
      existing.lookupLockedFields,
      fieldOptions,
    );
    const lockedFields = hasLockedFields
      ? normalizePayoutQueryLockedFields(settings.lockedFields, fieldOptions)
      : existingLockedFields;
    const visibleFields = hasVisibleFields
      ? normalizePayoutQueryFields(
          settings.visibleFields,
          fieldOptions,
          lockedFields,
        )
      : normalizePayoutQueryFields(
          existing.lookupVisibleFields,
          fieldOptions,
          lockedFields,
        );
    const updateData: Prisma.PayoutRegistrationFormUpdateInput = {};
    if (hasEnabled) updateData.lookupEnabled = settings.enabled;
    if (hasVisibleFields || hasLockedFields) {
      updateData.lookupVisibleFields = visibleFields;
      updateData.lookupLockedFields = lockedFields;
    }
    if (!hasEnabled && !hasVisibleFields && !hasLockedFields) {
      return this.lookupFormView(existing, fieldOptions);
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const form = await transaction.payoutRegistrationForm.update({
        where: { id: existing.id },
        data: updateData,
      });
      const hasFieldSettings = hasVisibleFields || hasLockedFields;
      const beforeData = hasFieldSettings
        ? {
            lookupEnabled: existing.lookupEnabled,
            visibleFields: normalizePayoutQueryFields(
              existing.lookupVisibleFields,
              fieldOptions,
              existingLockedFields,
            ),
            lockedFields: existingLockedFields,
          }
        : { lookupEnabled: existing.lookupEnabled };
      const afterData = hasFieldSettings
        ? {
            lookupEnabled: form.lookupEnabled,
            visibleFields: normalizePayoutQueryFields(
              form.lookupVisibleFields,
              fieldOptions,
              lockedFields,
            ),
            lockedFields,
          }
        : { lookupEnabled: form.lookupEnabled };
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: hasFieldSettings
            ? 'PAYOUT_LOOKUP_SETTINGS_UPDATED'
            : settings.enabled
              ? 'PAYOUT_LOOKUP_ENABLED'
              : 'PAYOUT_LOOKUP_DISABLED',
          entityType: 'PayoutRegistrationForm',
          entityId: form.id,
          beforeData,
          afterData,
        },
      });
      return form;
    });
    return this.lookupFormView(updated, fieldOptions);
  }

  async updateLookupEnabled(enabled: boolean, admin: AuthenticatedAdmin) {
    return this.updateLookupSettings({ enabled }, admin);
  }

  private async requirePublicForm(publicToken: string, requireEnabled = true) {
    const form = await this.prisma.payoutRegistrationForm.findUnique({
      where: { publicToken },
    });
    if (!form) throw new NotFoundException('回款登记链接不存在');
    if (requireEnabled && !form.enabled) {
      throw new ForbiddenException('当前回款资料填写已暂停');
    }
    return form;
  }

  async ensureExists(publicToken: string) {
    await this.requirePublicForm(publicToken, false);
  }

  async ensureAvailable(publicToken: string) {
    await this.requirePublicForm(publicToken);
  }

  private async requireLookupForm(
    lookupPublicToken: string,
    requireEnabled = true,
  ) {
    const form = await this.prisma.payoutRegistrationForm.findUnique({
      where: { lookupPublicToken },
    });
    if (!form) throw new NotFoundException('订单查询链接不存在');
    if (requireEnabled && !form.lookupEnabled) {
      throw new ForbiddenException('当前订单查询已暂停');
    }
    return form;
  }

  async describe(publicToken: string, identity: ResolvedPublicIdentity) {
    const form = await this.requirePublicForm(publicToken, false);
    const currentIdentity = await this.prisma.externalIdentity.findUnique({
      where: { id: identity.id },
      include: {
        submitter: { select: { code: true, name: true, nickname: true } },
      },
    });
    const locked = currentIdentity?.submitterId
      ? Boolean(
          await this.prisma.payoutMethod.findFirst({
            where: {
              submitterId: currentIdentity.submitterId,
              deletedAt: null,
              status: PayoutMethodStatus.ACTIVE,
            },
            select: { id: true },
          }),
        )
      : false;
    return {
      enabled: form.enabled,
      linked: Boolean(currentIdentity?.submitter?.code),
      identityCode: currentIdentity?.submitter?.code ?? identity.displayCode,
      nickname:
        currentIdentity?.submitter?.nickname ??
        currentIdentity?.submitter?.name ??
        '',
      locked,
    };
  }

  async describeLookup(
    lookupPublicToken: string,
    identity: ResolvedPublicIdentity,
  ) {
    const form = await this.requireLookupForm(lookupPublicToken, false);
    const fieldOptions = await this.payoutQueryFieldOptions();
    const lockedFields = normalizePayoutQueryLockedFields(
      form.lookupLockedFields,
      fieldOptions,
    );
    const publicFieldOptions = publicPayoutQueryFieldOptions(
      fieldOptions,
      lockedFields,
    );
    const currentIdentity = await this.prisma.externalIdentity.findUnique({
      where: { id: identity.id },
      include: {
        submitter: { select: { code: true, name: true, nickname: true } },
      },
    });
    return {
      enabled: form.lookupEnabled,
      linked: Boolean(currentIdentity?.submitter?.code),
      identityCode: currentIdentity?.submitter?.code ?? identity.displayCode,
      nickname:
        currentIdentity?.submitter?.nickname ??
        currentIdentity?.submitter?.name ??
        '',
      visibleFields: normalizePayoutQueryFields(
        form.lookupVisibleFields,
        fieldOptions,
        lockedFields,
      ),
      fieldOptions: publicFieldOptions,
    };
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
        accountMasked = '加密资料不可读';
      }
    }
    return { ...method, accountValueEncrypted: undefined, accountMasked };
  }

  async lookup(
    lookupPublicToken: string,
    identity: ResolvedPublicIdentity,
    dto: LookupPayoutHistoryDto,
    metadata: PublicRequestMetadata,
  ) {
    const form = await this.requireLookupForm(lookupPublicToken);
    const fieldOptions = await this.payoutQueryFieldOptions();
    const lockedFields = normalizePayoutQueryLockedFields(
      form.lookupLockedFields,
      fieldOptions,
    );
    const publicFieldOptions = publicPayoutQueryFieldOptions(
      fieldOptions,
      lockedFields,
    );
    const visibleFields = normalizePayoutQueryFields(
      form.lookupVisibleFields,
      fieldOptions,
      lockedFields,
    );
    const identityCode = dto.identityCode.trim().toUpperCase();
    const submitter = await this.prisma.submitter.findUnique({
      where: { code: identityCode },
      select: {
        id: true,
        code: true,
        name: true,
        nickname: true,
        status: true,
      },
    });
    if (!submitter || submitter.status !== SubmitterStatus.ACTIVE) {
      throw new NotFoundException('识别码不存在，请检查后重新输入');
    }

    if (identity.submitterId !== submitter.id) {
      await this.prisma.externalIdentity.update({
        where: { id: identity.id },
        data: { submitterId: submitter.id },
      });
      await this.prisma.auditLog.create({
        data: {
          source: 'PUBLIC_FORM',
          action: 'SUBMITTER_CODE_LINKED',
          entityType: 'ExternalIdentity',
          entityId: identity.id,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          afterData: {
            identityCode: submitter.code ?? identityCode,
            submitterId: submitter.id,
          },
        },
      });
    }

    const page = dto.page || 1;
    const pageSize = dto.pageSize || 20;
    const orderWhere = {
      submitterId: submitter.id,
      status: OrderStatus.ACTIVE,
      deletedAt: null,
    } satisfies Prisma.OrderWhereInput;
    const [payoutMethods, total, orders] = await Promise.all([
      this.prisma.payoutMethod.findMany({
        where: { submitterId: submitter.id, deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          type: true,
          label: true,
          accountName: true,
          accountValueEncrypted: true,
          bankName: true,
          isDefault: true,
          status: true,
          updatedAt: true,
        },
      }),
      this.prisma.order.count({ where: orderWhere }),
      this.prisma.order.findMany({
        where: orderWhere,
        orderBy: [{ orderedAt: 'desc' }, { serialNo: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          serialNo: true,
          orderedAt: true,
          platformOrderNo: true,
          purchaseAddress: true,
          shipmentStatus: true,
          fundingType: true,
          productNameSnapshot: true,
          inboundTrackingNo: true,
          paymentDiscountAmount: true,
          orderAmount: true,
          submitterSettlementAmount: true,
          platformRebateAmount: true,
          submitterSettlementStatus: true,
          saleAmount: true,
          receivableStatus: true,
          expectedProfit: true,
          settledProfit: true,
          notes: true,
          platform: { select: { name: true } },
          submitter: { select: { name: true } },
          category: { select: { name: true } },
          shipmentLink: {
            select: { shipment: { select: { trackingNo: true } } },
          },
          customValues: {
            select: { definitionId: true, value: true },
          },
        },
      }),
    ]);

    const editReasonHistory = new Map<
      string,
      Array<{ reason: string; createdAt: string }>
    >();
    if (visibleFields.includes('editReasonHistory') && orders.length) {
      const editLogs = await this.prisma.auditLog.findMany({
        where: {
          entityType: 'Order',
          entityId: { in: orders.map((order) => order.id) },
          action: 'ORDER_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
        select: { entityId: true, afterData: true, createdAt: true },
      });
      for (const log of editLogs) {
        const reason = this.auditReason(log.afterData);
        if (!reason) continue;
        const history = editReasonHistory.get(log.entityId) ?? [];
        history.push({ reason, createdAt: log.createdAt.toISOString() });
        editReasonHistory.set(log.entityId, history);
      }
    }

    const hasField = (key: PayoutQueryFieldKey) => visibleFields.includes(key);
    const items = orders.map((order) => {
      const item: Record<string, unknown> = {};
      const customValues = new Map(
        (order.customValues ?? []).map((entry) => [
          entry.definitionId,
          entry.value,
        ]),
      );
      for (const field of fieldOptions) {
        if (!hasField(field.key)) continue;
        if (field.customFieldId) {
          item[field.key] = customValues.get(field.customFieldId) ?? null;
          continue;
        }

        switch (field.key) {
          case 'serialNo':
            item.serialNo = order.serialNo;
            break;
          case 'orderedAt':
            item.orderedAt = order.orderedAt;
            break;
          case 'platform':
            item.platform = order.platform?.name ?? null;
            break;
          case 'submitter':
            item.submitter = order.submitter?.name ?? null;
            break;
          case 'category':
            item.category = order.category?.name ?? null;
            break;
          case 'schemeName':
            item.schemeName = order.productNameSnapshot;
            break;
          case 'platformOrderNo':
            item.platformOrderNo = order.platformOrderNo;
            break;
          case 'platformTrackingNo':
            item.platformTrackingNo = order.inboundTrackingNo;
            break;
          case 'purchaseAddress':
            item.purchaseAddress = order.purchaseAddress;
            break;
          case 'shipmentTrackingNo':
            item.shipmentTrackingNo =
              order.shipmentLink?.shipment?.trackingNo ?? null;
            break;
          case 'shipmentStatus':
            item.shipmentStatus = order.shipmentStatus;
            break;
          case 'fundingType':
            item.fundingType = order.fundingType;
            break;
          case 'paymentDiscountAmount':
            item.paymentDiscountAmount = order.paymentDiscountAmount;
            break;
          case 'orderAmount':
            item.orderAmount = order.orderAmount;
            break;
          case 'settlementAmount':
            item.settlementAmount = order.submitterSettlementAmount;
            break;
          case 'platformRebateAmount':
            item.platformRebateAmount = order.platformRebateAmount;
            break;
          case 'settlementStatus':
            item.settlementStatus =
              order.submitterSettlementStatus === SettlementStatus.PARTIAL
                ? SettlementStatus.UNPAID
                : order.submitterSettlementStatus;
            break;
          case 'saleAmount':
            item.saleAmount = order.saleAmount;
            break;
          case 'receivableStatus':
            item.receivableStatus = order.receivableStatus;
            break;
          case 'profit':
            item.profit = order.settledProfit;
            break;
          case 'notes':
            item.notes = order.notes;
            break;
          case 'editReasonHistory':
            item.editReasonHistory = editReasonHistory.get(order.id) ?? [];
            break;
        }
      }
      return item;
    });

    return {
      identityCode: submitter.code ?? identityCode,
      nickname: submitter.nickname ?? submitter.name,
      visibleFields,
      fieldOptions: publicFieldOptions,
      payoutMethods: payoutMethods.map((method) =>
        this.payoutMethodView(method),
      ),
      orders: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private normalizeMethod(method: PublicPayoutRegistrationMethodDto) {
    const accountValue = this.clean(method.accountValue);
    const accountName = this.clean(method.accountName);
    const bankName = this.clean(method.bankName);

    if (method.type === PayoutMethodType.WECHAT) {
      return {
        type: method.type,
        label: this.methodLabel(method.type),
        accountName: null,
        accountValueEncrypted: null,
        bankName: null,
        accountMasked: null,
      };
    }
    if (method.type === PayoutMethodType.ALIPAY) {
      if (!accountValue) throw new BadRequestException('请填写支付宝账号');
      return {
        type: method.type,
        label: this.methodLabel(method.type),
        accountName: null,
        accountValueEncrypted: encryptSensitiveValue(
          accountValue,
          this.encryptionKey(),
        ),
        bankName: null,
        accountMasked: maskSensitiveValue(accountValue),
      };
    }
    if (method.type !== PayoutMethodType.BANK_CARD) {
      throw new BadRequestException(
        '回款方式仅支持微信转账、支付宝和银行卡转账',
      );
    }
    if (!accountName) throw new BadRequestException('请填写银行卡真实姓名');
    if (!bankName) throw new BadRequestException('请填写开户银行');
    if (!accountValue) throw new BadRequestException('请填写银行卡号');
    return {
      type: method.type,
      label: this.methodLabel(method.type),
      accountName,
      accountValueEncrypted: encryptSensitiveValue(
        accountValue,
        this.encryptionKey(),
      ),
      bankName,
      accountMasked: maskSensitiveValue(accountValue),
    };
  }

  async submit(
    publicToken: string,
    identity: ResolvedPublicIdentity,
    dto: CreatePublicPayoutRegistrationDto,
    metadata: PublicRequestMetadata,
  ) {
    await this.requirePublicForm(publicToken);
    const nickname = dto.nickname.trim();
    if (!nickname) throw new BadRequestException('请填写微信昵称');
    const normalizedMethods = dto.methods.map((method) =>
      this.normalizeMethod(method),
    );

    return this.prisma.$transaction(
      async (transaction) => {
        const currentIdentity = await transaction.externalIdentity.findUnique({
          where: { id: identity.id },
          include: { submitter: true },
        });
        if (
          !currentIdentity ||
          currentIdentity.status !== ExternalIdentityStatus.ACTIVE
        ) {
          throw new NotFoundException('当前微信设备身份不存在');
        }

        let submitter = currentIdentity.submitter;
        if (submitter?.status === SubmitterStatus.DISABLED) {
          throw new BadRequestException('该下单人资料已停用，请联系管理员');
        }

        if (submitter) {
          const nicknameOwner = await transaction.submitter.findFirst({
            where: {
              id: { not: submitter.id },
              OR: [{ name: nickname }, { nickname }],
            },
            orderBy: { createdAt: 'asc' },
          });
          if (nicknameOwner) throwSubmitterNicknameConflict(nickname);

          if (
            !submitter.code ||
            submitter.name !== nickname ||
            submitter.nickname !== nickname
          ) {
            submitter = await transaction.submitter.update({
              where: { id: submitter.id },
              data: {
                code: submitter.code ?? currentIdentity.displayCode,
                name: nickname,
                nickname,
              },
            });
          }
        } else {
          const nicknameMatches = await transaction.submitter.findMany({
            where: { OR: [{ name: nickname }, { nickname }] },
            orderBy: { createdAt: 'asc' },
            take: 2,
            include: { _count: { select: { externalIdentities: true } } },
          });
          assertNicknameCanBeClaimed(nicknameMatches, nickname);

          const claimableSubmitter = nicknameMatches[0];
          submitter = claimableSubmitter
            ? await transaction.submitter.update({
                where: { id: claimableSubmitter.id },
                data: {
                  code: currentIdentity.displayCode,
                  name: nickname,
                  nickname,
                },
              })
            : await transaction.submitter.create({
                data: {
                  code: currentIdentity.displayCode,
                  name: nickname,
                  nickname,
                  status: SubmitterStatus.ACTIVE,
                },
              });
        }

        const confirmedMethod = await transaction.payoutMethod.findFirst({
          where: {
            submitterId: submitter.id,
            deletedAt: null,
            status: PayoutMethodStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (confirmedMethod) {
          throw new ConflictException(
            '回款资料已由管理员确认，如需变更请联系管理员',
          );
        }

        const identityCode = submitter.code ?? currentIdentity.displayCode;

        if (currentIdentity.submitterId !== submitter.id) {
          await transaction.externalIdentity.update({
            where: { id: currentIdentity.id },
            data: { submitterId: submitter.id },
          });
        }

        let hasDefault =
          (await transaction.payoutMethod.count({
            where: {
              submitterId: submitter.id,
              deletedAt: null,
              isDefault: true,
            },
          })) > 0;

        const savedMethodIds: string[] = [];
        for (const [index, method] of normalizedMethods.entries()) {
          const existing = await transaction.payoutMethod.findFirst({
            where: {
              submitterId: submitter.id,
              type: method.type,
              deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
          });
          const isDefault = existing?.isDefault ?? (!hasDefault && index === 0);
          if (isDefault) hasDefault = true;
          const data = {
            type: method.type,
            label: method.label,
            accountName: method.accountName,
            accountValueEncrypted: method.accountValueEncrypted,
            bankName: method.bankName,
            status: PayoutMethodStatus.PENDING,
            isDefault,
          };
          const saved = existing
            ? await transaction.payoutMethod.update({
                where: { id: existing.id },
                data,
              })
            : await transaction.payoutMethod.create({
                data: { ...data, submitterId: submitter.id },
              });
          savedMethodIds.push(saved.id);
        }

        await transaction.auditLog.create({
          data: {
            source: 'PUBLIC_FORM',
            action: 'PAYOUT_REGISTRATION_SUBMITTED',
            entityType: 'Submitter',
            entityId: submitter.id,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            afterData: {
              nickname,
              identityCode,
              methods: normalizedMethods.map((method) => ({
                type: method.type,
                accountName: method.accountName,
                bankName: method.bankName,
                accountMasked: method.accountMasked,
              })),
            } satisfies Prisma.InputJsonValue,
          },
        });

        return {
          identityCode,
          nickname,
          submittedCount: savedMethodIds.length,
          status: PayoutMethodStatus.PENDING,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
