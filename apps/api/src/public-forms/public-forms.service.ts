import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExternalIdentityStatus,
  FundingType,
  OrderSource,
  PayoutMethodStatus,
  Prisma,
  ReviewStatus,
  ShareFormStatus,
  SubmitterStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertNicknameCanBeClaimed,
  throwSubmitterNicknameConflict,
} from '../identity/submitter-nickname';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveValue,
} from '../security/sensitive-value';
import {
  normalizeShareFormFieldConfig,
  ShareFormFieldConfig,
  ShareFormFieldKey,
} from '../schemes/share-form-config';
import { sanitizeShareFormRichText } from '../schemes/share-form-rich-text';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePublicPayoutMethodDto } from './dto/create-public-payout-method.dto';
import { UpdatePublicOrderDto } from './dto/update-public-order.dto';
import type { ResolvedPublicIdentity } from './public-identity.service';

type PublicOrderInput = CreatePublicOrderDto | UpdatePublicOrderDto;

@Injectable()
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: ConfigService,
  ) {}

  private clean(value: string | undefined | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private encryptionKey() {
    return this.appConfig.getOrThrow<string>('DATA_ENCRYPTION_KEY');
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

  private orderedAt(value: string | undefined) {
    const date =
      value ??
      new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Shanghai',
      });
    const parsed = new Date(`${date.slice(0, 10)}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('下单日期格式不正确');
    }
    return parsed;
  }

  private businessDate(value: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private config(value: Prisma.JsonValue): ShareFormFieldConfig {
    try {
      return normalizeShareFormFieldConfig(value);
    } catch {
      throw new InternalServerErrorException('分享表单字段配置异常');
    }
  }

  private async getForm(publicToken: string, requireActive: boolean) {
    const form = await this.prisma.shareForm.findUnique({
      where: { publicToken },
      include: {
        scheme: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { orders: { where: { deletedAt: null } } },
        },
      },
    });
    if (!form) throw new NotFoundException('分享链接不存在或已经失效');

    if (requireActive) {
      const now = new Date();
      if (!form.scheme.enabled || form.status !== ShareFormStatus.ACTIVE) {
        throw new GoneException('该登记链接当前未开放');
      }
      if (form.startsAt && form.startsAt > now) {
        throw new GoneException('该登记链接尚未开始');
      }
      if (form.expiresAt && form.expiresAt <= now) {
        throw new GoneException('该登记链接已经过期');
      }
      if (
        form.submissionLimit !== null &&
        form._count.orders >= form.submissionLimit
      ) {
        throw new GoneException('该登记链接已达到提交上限');
      }
    }

    return form;
  }

  async ensureForm(publicToken: string, requireActive: boolean) {
    await this.getForm(publicToken, requireActive);
  }

  private isProvided(value: unknown) {
    return value !== undefined && value !== null && value !== '';
  }

  private assertRequiredFields(
    config: ShareFormFieldConfig,
    input: PublicOrderInput,
  ) {
    const values: Record<ShareFormFieldKey, unknown> = {
      wechatNickname: input.wechatNickname,
      platformId: input.platformId,
      categoryId: input.categoryId,
      productName: input.productName,
      orderedAt: input.orderedAt,
      platformOrderNo: input.platformOrderNo,
      inboundTrackingNo: input.inboundTrackingNo,
      purchaseAddress: input.purchaseAddress,
      fundingType: input.fundingType,
      orderAmount: input.orderAmount,
      paymentDiscountAmount: input.paymentDiscountAmount,
      rebateScanned: input.rebateScanned,
      submitterSettlementAmount: input.submitterSettlementAmount,
      notes: input.notes,
    };

    const labels: Record<ShareFormFieldKey, string> = {
      wechatNickname: '微信昵称',
      platformId: '下单平台',
      categoryId: '品类',
      productName: '商品/方案*数量',
      orderedAt: '下单日期',
      platformOrderNo: '平台订单号',
      inboundTrackingNo: '平台运单号',
      purchaseAddress: '下单地址',
      fundingType: '支付方式',
      orderAmount: '下单金额',
      paymentDiscountAmount: '支付优惠',
      rebateScanned: '是否扫码',
      submitterSettlementAmount: '结算金额',
      notes: '备注',
    };

    for (const key of Object.keys(config.fields) as ShareFormFieldKey[]) {
      const rule = config.fields[key];
      if (rule.visible && rule.required && !this.isProvided(values[key])) {
        throw new BadRequestException(`${labels[key]}为必填项`);
      }
    }
  }

  private settlementAmount(
    config: ShareFormFieldConfig,
    value: number | undefined,
  ) {
    switch (config.settlementAmount.mode) {
      case 'ADMIN_ONLY':
        return 0;
      case 'FIXED':
        return config.settlementAmount.fixedAmount ?? 0;
      case 'PRESET':
        if (
          value === undefined ||
          !config.settlementAmount.options.includes(value)
        ) {
          throw new BadRequestException('请选择预设的结算金额');
        }
        return value;
      case 'FREE':
        return value ?? 0;
    }
  }

  private visibleValue<T>(
    config: ShareFormFieldConfig,
    key: ShareFormFieldKey,
    value: T | undefined,
    fallback: T,
  ) {
    const rule = config.fields[key];
    return rule.visible && rule.editable && value !== undefined
      ? value
      : fallback;
  }

  private async resolveOrderSubmitter(
    transaction: Prisma.TransactionClient,
    identity: ResolvedPublicIdentity,
    nickname: string | null,
  ) {
    const normalized = nickname?.trim();
    if (!normalized) throw new BadRequestException('下单人微信昵称不能为空');

    const currentIdentity = await transaction.externalIdentity.findUnique({
      where: { id: identity.id },
      include: { submitter: true },
    });
    if (
      !currentIdentity ||
      currentIdentity.status !== ExternalIdentityStatus.ACTIVE
    ) {
      throw new ForbiddenException('当前访问身份已经失效');
    }

    let submitter = currentIdentity.submitter;
    if (submitter?.status === SubmitterStatus.DISABLED) {
      throw new ForbiddenException('该下单人资料已经停用');
    }

    if (submitter) {
      const nicknameOwner = await transaction.submitter.findFirst({
        where: {
          id: { not: submitter.id },
          OR: [{ name: normalized }, { nickname: normalized }],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (nicknameOwner) throwSubmitterNicknameConflict(normalized);

      if (
        !submitter.code ||
        submitter.name !== normalized ||
        submitter.nickname !== normalized
      ) {
        submitter = await transaction.submitter.update({
          where: { id: submitter.id },
          data: {
            code: submitter.code ?? currentIdentity.displayCode,
            name: normalized,
            nickname: normalized,
          },
        });
      }
      return submitter;
    }

    const nicknameMatches = await transaction.submitter.findMany({
      where: { OR: [{ name: normalized }, { nickname: normalized }] },
      orderBy: { createdAt: 'asc' },
      take: 2,
      include: { _count: { select: { externalIdentities: true } } },
    });
    assertNicknameCanBeClaimed(nicknameMatches, normalized);

    const claimableSubmitter = nicknameMatches[0];
    submitter = claimableSubmitter
      ? await transaction.submitter.update({
          where: { id: claimableSubmitter.id },
          data: {
            code: currentIdentity.displayCode,
            name: normalized,
            nickname: normalized,
          },
        })
      : await transaction.submitter.create({
          data: {
            code: currentIdentity.displayCode,
            name: normalized,
            nickname: normalized,
          },
        });
    await transaction.externalIdentity.update({
      where: { id: currentIdentity.id },
      data: { submitterId: submitter.id },
    });
    return submitter;
  }

  private async requireLinkedSubmitter(
    transaction: Prisma.TransactionClient,
    identity: ResolvedPublicIdentity,
  ) {
    const current = await transaction.externalIdentity.findUnique({
      where: { id: identity.id },
    });
    if (!current || current.status !== ExternalIdentityStatus.ACTIVE) {
      throw new ForbiddenException('当前访问身份已经失效');
    }
    if (current.submitterId) return current.submitterId;
    throw new BadRequestException('请先填写微信昵称并提交订单，再登记收款方式');
  }

  async describe(publicToken: string, identity: ResolvedPublicIdentity) {
    const form = await this.getForm(publicToken, true);
    const [platforms, categories, fullIdentity] = await Promise.all([
      this.prisma.platform.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
      this.prisma.category.findMany({
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.externalIdentity.findUnique({
        where: { id: identity.id },
        include: {
          submitter: {
            select: {
              id: true,
              code: true,
              name: true,
              nickname: true,
              payoutMethods: {
                where: { deletedAt: null },
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
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      identity: {
        displayCode: fullIdentity?.submitter?.code ?? identity.displayCode,
        submitter: fullIdentity?.submitter
          ? {
              ...fullIdentity.submitter,
              payoutMethods: fullIdentity.submitter.payoutMethods.map(
                (method) => this.payoutMethodView(method),
              ),
            }
          : null,
      },
      form: {
        id: form.id,
        title: form.title,
        description: sanitizeShareFormRichText(form.description),
        fieldConfig: this.config(form.fieldConfig),
        allowEditBeforeApproval: form.allowEditBeforeApproval,
        allowDeleteBeforeApproval: form.allowDeleteBeforeApproval,
        scheme: {
          name: form.scheme.name,
          productName: form.scheme.productName,
          description: sanitizeShareFormRichText(form.scheme.description),
          defaultValues: form.scheme.defaultValues,
        },
      },
      options: { platforms, categories },
    };
  }

  async createOrder(
    publicToken: string,
    identity: ResolvedPublicIdentity,
    dto: CreatePublicOrderDto,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, true);
    const config = this.config(form.fieldConfig);
    this.assertRequiredFields(config, dto);
    const defaults =
      form.scheme.defaultValues && typeof form.scheme.defaultValues === 'object'
        ? (form.scheme.defaultValues as Record<string, unknown>)
        : {};

    const platform = await this.prisma.platform.findFirst({
      where: { id: dto.platformId, enabled: true },
    });
    if (!platform) throw new BadRequestException('选择的下单平台不可用');

    const categoryId = this.visibleValue(
      config,
      'categoryId',
      dto.categoryId,
      undefined,
    );
    if (
      categoryId &&
      !(await this.prisma.category.findFirst({
        where: { id: categoryId, enabled: true },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('选择的品类不可用');
    }

    const productName =
      this.clean(
        this.visibleValue(config, 'productName', dto.productName, ''),
      ) ?? '';

    const nickname = this.clean(
      this.visibleValue(config, 'wechatNickname', dto.wechatNickname, ''),
    );
    const settlementAmount = this.settlementAmount(
      config,
      dto.submitterSettlementAmount,
    );

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          if (form.submissionLimit !== null) {
            const count = await transaction.order.count({
              where: { shareFormId: form.id, deletedAt: null },
            });
            if (count >= form.submissionLimit) {
              throw new GoneException('该登记链接已达到提交上限');
            }
          }

          const submitter = await this.resolveOrderSubmitter(
            transaction,
            identity,
            nickname,
          );
          const fundingType = this.visibleValue(
            config,
            'fundingType',
            dto.fundingType,
            (defaults.fundingType as FundingType | undefined) ??
              FundingType.SUBMITTER_ADVANCED,
          );
          const order = await transaction.order.create({
            data: {
              source: OrderSource.SHARE,
              reviewStatus: ReviewStatus.PENDING,
              shareFormId: form.id,
              externalIdentityId: identity.id,
              submitterId: submitter.id,
              platformId: dto.platformId,
              categoryId,
              orderedAt: this.orderedAt(
                this.visibleValue(
                  config,
                  'orderedAt',
                  dto.orderedAt,
                  undefined,
                ),
              ),
              productNameSnapshot: productName,
              schemeNameSnapshot: null,
              submitterWechatNickname: nickname,
              rebateScanned: this.visibleValue(
                config,
                'rebateScanned',
                dto.rebateScanned,
                undefined,
              ),
              platformOrderNo: this.clean(
                this.visibleValue(
                  config,
                  'platformOrderNo',
                  dto.platformOrderNo,
                  '',
                ),
              ),
              inboundTrackingNo: this.clean(
                this.visibleValue(
                  config,
                  'inboundTrackingNo',
                  dto.inboundTrackingNo,
                  '',
                ),
              ),
              purchaseAddress: this.clean(
                this.visibleValue(
                  config,
                  'purchaseAddress',
                  dto.purchaseAddress,
                  '',
                ),
              ),
              fundingType,
              orderAmount: this.visibleValue(
                config,
                'orderAmount',
                dto.orderAmount,
                Number(defaults.orderAmount ?? 0),
              ),
              paymentDiscountAmount: this.visibleValue(
                config,
                'paymentDiscountAmount',
                dto.paymentDiscountAmount,
                Number(defaults.paymentDiscountAmount ?? 0),
              ),
              submitterSettlementAmount: settlementAmount,
              notes: this.clean(
                this.visibleValue(config, 'notes', dto.notes, ''),
              ),
            },
          });
          await transaction.auditLog.create({
            data: {
              source: 'PUBLIC_FORM',
              action: 'ORDER_SUBMITTED',
              entityType: 'Order',
              entityId: order.id,
              ipAddress: requestMetadata.ipAddress,
              userAgent: requestMetadata.userAgent,
              afterData: {
                serialNo: order.serialNo,
                shareFormId: form.id,
                externalIdentityId: identity.id,
                platformId: order.platformId,
                platformOrderNo: order.platformOrderNo,
                reviewStatus: order.reviewStatus,
              },
            },
          });
          return {
            id: order.id,
            serialNo: order.serialNo,
            reviewStatus: order.reviewStatus,
            createdAt: order.createdAt,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('平台订单号已经登记');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException('同时提交人数较多，请重新提交');
      }
      throw error;
    }
  }

  async listMine(publicToken: string, identity: ResolvedPublicIdentity) {
    const form = await this.getForm(publicToken, false);
    const items = await this.prisma.order.findMany({
      where: {
        shareFormId: form.id,
        externalIdentityId: identity.id,
        submitterId: identity.submitterId ?? undefined,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        platform: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        submitter: { select: { id: true, name: true, nickname: true } },
      },
    });

    return items.map((order) => ({
      id: order.id,
      serialNo: order.serialNo,
      reviewStatus: order.reviewStatus,
      status: order.status,
      orderedAt: this.businessDate(order.orderedAt),
      productName: order.productNameSnapshot,
      category: order.category,
      wechatNickname: order.submitterWechatNickname,
      platform: order.platform,
      submitter: order.submitter,
      platformOrderNo: order.platformOrderNo,
      inboundTrackingNo: order.inboundTrackingNo,
      purchaseAddress: order.purchaseAddress,
      fundingType: order.fundingType,
      orderAmount: order.orderAmount,
      paymentDiscountAmount: order.paymentDiscountAmount,
      rebateScanned: order.rebateScanned,
      submitterSettlementAmount: order.submitterSettlementAmount,
      submitterSettlementStatus: order.submitterSettlementStatus,
      notes: order.notes,
      createdAt: order.createdAt,
      canEdit:
        form.allowEditBeforeApproval &&
        order.reviewStatus === ReviewStatus.PENDING,
      canDelete:
        form.allowDeleteBeforeApproval &&
        order.reviewStatus === ReviewStatus.PENDING,
    }));
  }

  async updateMine(
    publicToken: string,
    orderId: string,
    identity: ResolvedPublicIdentity,
    dto: UpdatePublicOrderDto,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, false);
    if (!form.allowEditBeforeApproval) {
      throw new ForbiddenException('管理员未开放提交后的修改权限');
    }
    const existing = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        shareFormId: form.id,
        externalIdentityId: identity.id,
        submitterId: identity.submitterId ?? undefined,
        deletedAt: null,
      },
    });
    if (!existing) throw new NotFoundException('登记记录不存在');
    if (existing.reviewStatus !== ReviewStatus.PENDING) {
      throw new ForbiddenException('管理员确认后不能再修改');
    }

    const config = this.config(form.fieldConfig);
    const editableValue = <T>(
      key: ShareFormFieldKey,
      value: T | undefined,
      current: T,
    ): T =>
      config.fields[key].visible &&
      config.fields[key].editable &&
      value !== undefined
        ? value
        : current;
    const merged: CreatePublicOrderDto = {
      platformId: dto.platformId ?? existing.platformId,
      wechatNickname: editableValue(
        'wechatNickname',
        dto.wechatNickname,
        existing.submitterWechatNickname ?? '',
      ),
      categoryId: editableValue(
        'categoryId',
        dto.categoryId,
        existing.categoryId ?? undefined,
      ),
      productName: editableValue(
        'productName',
        dto.productName,
        existing.productNameSnapshot,
      ),
      orderedAt: editableValue(
        'orderedAt',
        dto.orderedAt,
        this.businessDate(existing.orderedAt),
      ),
      platformOrderNo: editableValue(
        'platformOrderNo',
        dto.platformOrderNo,
        existing.platformOrderNo ?? '',
      ),
      inboundTrackingNo: editableValue(
        'inboundTrackingNo',
        dto.inboundTrackingNo,
        existing.inboundTrackingNo ?? '',
      ),
      purchaseAddress: editableValue(
        'purchaseAddress',
        dto.purchaseAddress,
        existing.purchaseAddress ?? '',
      ),
      fundingType: editableValue(
        'fundingType',
        dto.fundingType,
        existing.fundingType,
      ),
      orderAmount: editableValue(
        'orderAmount',
        dto.orderAmount,
        existing.orderAmount.toNumber(),
      ),
      paymentDiscountAmount: editableValue(
        'paymentDiscountAmount',
        dto.paymentDiscountAmount,
        existing.paymentDiscountAmount.toNumber(),
      ),
      rebateScanned: editableValue(
        'rebateScanned',
        dto.rebateScanned,
        existing.rebateScanned ?? undefined,
      ),
      submitterSettlementAmount: editableValue(
        'submitterSettlementAmount',
        dto.submitterSettlementAmount,
        existing.submitterSettlementAmount.toNumber(),
      ),
      notes: editableValue('notes', dto.notes, existing.notes ?? ''),
    };
    this.assertRequiredFields(config, merged);

    const platform = await this.prisma.platform.findFirst({
      where: { id: merged.platformId, enabled: true },
    });
    if (!platform) throw new BadRequestException('选择的下单平台不可用');
    if (
      merged.categoryId &&
      !(await this.prisma.category.findFirst({
        where: { id: merged.categoryId, enabled: true },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('选择的品类不可用');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const submitter = await this.resolveOrderSubmitter(
          transaction,
          identity,
          this.clean(merged.wechatNickname),
        );
        const updated = await transaction.order.update({
          where: { id: existing.id },
          data: {
            platformId: merged.platformId,
            categoryId: merged.categoryId ?? null,
            submitterId: submitter.id,
            submitterWechatNickname: this.clean(merged.wechatNickname),
            productNameSnapshot: this.clean(merged.productName) ?? '',
            orderedAt: this.orderedAt(merged.orderedAt),
            platformOrderNo: this.clean(merged.platformOrderNo),
            inboundTrackingNo: this.clean(merged.inboundTrackingNo),
            purchaseAddress: this.clean(merged.purchaseAddress),
            fundingType: merged.fundingType,
            orderAmount: merged.orderAmount,
            paymentDiscountAmount: merged.paymentDiscountAmount,
            rebateScanned: merged.rebateScanned,
            submitterSettlementAmount: this.settlementAmount(
              config,
              merged.submitterSettlementAmount,
            ),
            notes: this.clean(merged.notes),
          },
        });
        await transaction.auditLog.create({
          data: {
            source: 'PUBLIC_FORM',
            action: 'ORDER_UPDATED_BEFORE_APPROVAL',
            entityType: 'Order',
            entityId: updated.id,
            ipAddress: requestMetadata.ipAddress,
            userAgent: requestMetadata.userAgent,
            beforeData: {
              platformId: existing.platformId,
              platformOrderNo: existing.platformOrderNo,
              orderAmount: existing.orderAmount.toString(),
              submitterSettlementAmount:
                existing.submitterSettlementAmount.toString(),
            },
            afterData: {
              platformId: updated.platformId,
              platformOrderNo: updated.platformOrderNo,
              orderAmount: updated.orderAmount.toString(),
              submitterSettlementAmount:
                updated.submitterSettlementAmount.toString(),
            },
          },
        });
        return { id: updated.id, updatedAt: updated.updatedAt };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('平台订单号已经登记');
      }
      throw error;
    }
  }

  async deleteMine(
    publicToken: string,
    orderId: string,
    identity: ResolvedPublicIdentity,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, false);
    if (!form.allowDeleteBeforeApproval) {
      throw new ForbiddenException('管理员未开放删除权限');
    }
    const existing = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        shareFormId: form.id,
        externalIdentityId: identity.id,
        submitterId: identity.submitterId ?? undefined,
        deletedAt: null,
      },
    });
    if (!existing) throw new NotFoundException('登记记录不存在');
    if (existing.reviewStatus !== ReviewStatus.PENDING) {
      throw new ForbiddenException('管理员确认后不能再删除');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          source: 'PUBLIC_FORM',
          action: 'ORDER_DELETED_BEFORE_APPROVAL',
          entityType: 'Order',
          entityId: existing.id,
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          beforeData: {
            serialNo: existing.serialNo,
            reviewStatus: existing.reviewStatus,
          },
        },
      });
    });
  }

  async createPayoutMethod(
    publicToken: string,
    identity: ResolvedPublicIdentity,
    dto: CreatePublicPayoutMethodDto,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    await this.getForm(publicToken, true);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('收款方式名称不能为空');
    const accountValue = this.clean(dto.accountValue);

    return this.prisma.$transaction(async (transaction) => {
      const submitterId = await this.requireLinkedSubmitter(
        transaction,
        identity,
      );
      const confirmedMethod = await transaction.payoutMethod.findFirst({
        where: {
          submitterId,
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
      if (dto.isDefault ?? true) {
        await transaction.payoutMethod.updateMany({
          where: { submitterId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      const method = await transaction.payoutMethod.create({
        data: {
          submitterId,
          type: dto.type,
          label,
          accountName: this.clean(dto.accountName),
          accountValueEncrypted: accountValue
            ? encryptSensitiveValue(accountValue, this.encryptionKey())
            : null,
          bankName: this.clean(dto.bankName),
          isDefault: dto.isDefault ?? true,
          status: PayoutMethodStatus.PENDING,
        },
      });
      await transaction.auditLog.create({
        data: {
          source: 'PUBLIC_FORM',
          action: 'PAYOUT_METHOD_SUBMITTED',
          entityType: 'PayoutMethod',
          entityId: method.id,
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          afterData: {
            submitterId,
            type: method.type,
            label: method.label,
            accountMasked: accountValue
              ? maskSensitiveValue(accountValue)
              : null,
            isDefault: method.isDefault,
            status: method.status,
          },
        },
      });
      return this.payoutMethodView(method);
    });
  }

  async deletePayoutMethod(
    publicToken: string,
    methodId: string,
    identity: ResolvedPublicIdentity,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    await this.getForm(publicToken, false);
    const currentIdentity = await this.prisma.externalIdentity.findUnique({
      where: { id: identity.id },
    });
    if (!currentIdentity?.submitterId) {
      throw new NotFoundException('收款方式不存在');
    }
    const method = await this.prisma.payoutMethod.findFirst({
      where: {
        id: methodId,
        submitterId: currentIdentity.submitterId,
        deletedAt: null,
      },
    });
    if (!method) throw new NotFoundException('收款方式不存在');
    if (method.status !== PayoutMethodStatus.PENDING) {
      throw new ForbiddenException('管理员确认后的收款方式请联系管理员修改');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.payoutMethod.update({
        where: { id: method.id },
        data: {
          deletedAt: new Date(),
          isDefault: false,
          status: PayoutMethodStatus.DISABLED,
        },
      });
      await transaction.auditLog.create({
        data: {
          source: 'PUBLIC_FORM',
          action: 'PAYOUT_METHOD_DELETED_BEFORE_APPROVAL',
          entityType: 'PayoutMethod',
          entityId: method.id,
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          beforeData: {
            type: method.type,
            label: method.label,
            status: method.status,
          },
        },
      });
    });
  }
}
