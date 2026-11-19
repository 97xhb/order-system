import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ExternalIdentityStatus,
  DispatchStatus,
  OrderSource,
  PayoutMethodStatus,
  Prisma,
  ReviewStatus,
  ShareFormStatus,
  SubmitterStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildOrderChangeSnapshot,
  diffOrderChanges,
} from '../notifications/notification-template';
import { DEFAULT_FUNDING_METHOD_CODE } from '../catalog/funding-methods';
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
import {
  amountFormulasFromCustomData,
  normalizeAmountFormulas,
} from '../orders/amount-formulas';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePublicOrdersBatchDto } from './dto/create-public-orders-batch.dto';
import { CreatePublicPayoutMethodDto } from './dto/create-public-payout-method.dto';
import { UpdatePublicOrderDto } from './dto/update-public-order.dto';
import type { ResolvedPublicIdentity } from './public-identity.service';

type PublicOrderInput = CreatePublicOrderDto | UpdatePublicOrderDto;
const PUBLIC_AMOUNT_FORMULA_KEYS = [
  'orderAmount',
  'paymentDiscountAmount',
  'submitterSettlementAmount',
] as const;

const PUBLIC_ORDER_FIELD_LABELS: Record<string, string> = {
  platformId: '下单平台',
  wechatNickname: '下单人微信昵称',
  categoryId: '品类',
  productName: '商品/方案*数量',
  orderedAt: '下单日期',
  platformOrderNo: '平台订单号',
  dispatchStatus: '发货状态',
  inboundTrackingNo: '平台运单号',
  purchaseAddress: '下单地址',
  receiverName: '收货佬',
  fundingType: '支付方式',
  orderAmount: '下单金额',
  paymentDiscountAmount: '支付优惠',
  rebateScanned: '扫码返利',
  submitterSettlementAmount: '结算金额',
  notes: '备注',
};

@Injectable()
export class PublicFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private clean(value: string | undefined | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private syncDispatchStatusWithTracking(
    inboundTrackingNo: string | null | undefined,
    dispatchStatus: DispatchStatus,
  ) {
    return this.clean(inboundTrackingNo) &&
      dispatchStatus === DispatchStatus.NOT_SHIPPED
      ? DispatchStatus.SHIPPED
      : dispatchStatus;
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

  private amountFormulas(
    config: ShareFormFieldConfig,
    value: Record<string, string> | undefined,
  ) {
    const allowed = PUBLIC_AMOUNT_FORMULA_KEYS.filter(
      (key) =>
        config.fields[key].visible &&
        config.fields[key].editable &&
        (key !== 'submitterSettlementAmount' ||
          config.settlementAmount.mode === 'FREE'),
    );
    return normalizeAmountFormulas(value, allowed);
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
      },
    });
    if (!form) throw new NotFoundException('分享链接不存在或已经失效');

    if (requireActive) {
      const now = new Date();
      if (form.status !== ShareFormStatus.ACTIVE) {
        throw new GoneException('该登记链接当前未开放');
      }
      if (form.startsAt && form.startsAt > now) {
        throw new GoneException('该登记链接尚未开始');
      }
      if (form.expiresAt && form.expiresAt <= now) {
        throw new GoneException('该登记链接已经过期');
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

  /**
   * 批量模式下的单条校验：只做 DTO 级别的类型/长度/取值校验，
   * 保证某一行填错时只影响这一行，不会让整批请求直接失败。
   */
  private async validateBatchItem(
    raw: Record<string, unknown>,
  ): Promise<CreatePublicOrderDto> {
    const instance = plainToInstance(CreatePublicOrderDto, raw, {
      enableImplicitConversion: false,
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
      forbidUnknownValues: false,
    });
    if (!errors.length) {
      return Object.assign(
        new CreatePublicOrderDto(),
        instance,
      ) as CreatePublicOrderDto;
    }
    const messages: string[] = [];
    const visit = (error: {
      property: string;
      constraints?: Record<string, string> | null;
      children?: Array<unknown>;
    }) => {
      const label = PUBLIC_ORDER_FIELD_LABELS[error.property] ?? error.property;
      const constraintKeys = Object.keys(error.constraints ?? {});
      if (constraintKeys.length) {
        if (
          constraintKeys.some((key) =>
            ['isDefined', 'isNotEmpty'].includes(key),
          )
        ) {
          messages.push(`${label}为必填项`);
        } else {
          messages.push(`${label}填写格式或内容不正确`);
        }
      }
    };
    errors.forEach(visit);
    throw new BadRequestException(messages.join('；') || '填写内容不正确');
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
      dispatchStatus: input.dispatchStatus,
      inboundTrackingNo: input.inboundTrackingNo,
      purchaseAddress: input.purchaseAddress,
      receiverName: input.receiverName,
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
      dispatchStatus: '发货状态',
      inboundTrackingNo: '平台运单号',
      purchaseAddress: '下单地址',
      receiverName: '收货佬',
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
    const [platforms, categories, fundingMethods, fullIdentity] =
      await Promise.all([
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
        this.prisma.fundingMethod.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: { code: true, name: true },
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
        canSubmit: form.scheme.enabled,
        scheme: {
          name: form.scheme.name,
          productName: form.scheme.productName,
          productNameHtml: sanitizeShareFormRichText(
            form.scheme.productNameHtml,
          ),
          description: sanitizeShareFormRichText(form.scheme.description),
          defaultValues: form.scheme.defaultValues,
        },
      },
      options: { platforms, categories, fundingMethods },
    };
  }

  async createOrder(
    publicToken: string,
    identity: ResolvedPublicIdentity,
    dto: CreatePublicOrderDto,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, true);
    if (!form.scheme.enabled) {
      throw new GoneException('该方案当前已停用，暂不能提交新报单');
    }
    const config = this.config(form.fieldConfig);
    const prepared = await this.prepareOrder(form, config, dto);

    let created: { id: string; serialNo: number; reviewStatus: string; createdAt: Date };
    try {
      created = await this.prisma.$transaction(
        async (transaction) => {
          await this.assertSubmissionLimit(transaction, form);
          const submitter = await this.resolveOrderSubmitter(
            transaction,
            identity,
            prepared.nickname,
          );
          const order = await transaction.order.create({
            data: {
              ...prepared.data,
              externalIdentityId: identity.id,
              submitterId: submitter.id,
            },
          });
          await this.writeSubmissionAuditLog(
            transaction,
            order,
            identity,
            requestMetadata,
          );
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
      throw this.mapOrderWriteError(error);
    }
    await this.notifications.notifyOrderEvent('ORDER_SUBMITTED', [created.id], {
      requestMetadata,
    });
    return created;
  }

  /**
   * 预校验并组装一条订单的入库数据。只做字段权限过滤与业务校验，不写库，
   * 供单笔提交与批量提交共用，保证两条路径的规则完全一致。
   */
  private async prepareOrder(
    form: {
      id: string;
      fieldConfig: Prisma.JsonValue;
      scheme: {
        name?: string | null;
        productName?: string | null;
        defaultValues?: Prisma.JsonValue | null;
      };
    },
    config: ShareFormFieldConfig,
    dto: CreatePublicOrderDto,
  ) {
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
        this.visibleValue(
          config,
          'productName',
          dto.productName,
          form.scheme.name || form.scheme.productName,
        ),
      ) ?? '';

    const nickname = this.clean(
      this.visibleValue(config, 'wechatNickname', dto.wechatNickname, ''),
    );
    const settlementAmount = this.settlementAmount(
      config,
      dto.submitterSettlementAmount,
    );
    const inboundTrackingNo = this.clean(
      this.visibleValue(config, 'inboundTrackingNo', dto.inboundTrackingNo, ''),
    );
    const dispatchStatus = this.syncDispatchStatusWithTracking(
      inboundTrackingNo,
      this.visibleValue(
        config,
        'dispatchStatus',
        dto.dispatchStatus,
        inboundTrackingNo ? DispatchStatus.SHIPPED : DispatchStatus.NOT_SHIPPED,
      ),
    );
    const receiverName = this.clean(
      this.visibleValue(config, 'receiverName', dto.receiverName, ''),
    );
    const amountFormulas = this.amountFormulas(config, dto.amountFormulas);
    const fundingType = this.visibleValue(
      config,
      'fundingType',
      dto.fundingType,
      DEFAULT_FUNDING_METHOD_CODE,
    );
    const fundingMethod = await this.prisma.fundingMethod.findFirst({
      where: { code: fundingType, enabled: true },
      select: { code: true },
    });
    const safeFundingType = fundingMethod?.code ?? DEFAULT_FUNDING_METHOD_CODE;

    return {
      nickname,
      data: {
        source: OrderSource.SHARE,
        reviewStatus: ReviewStatus.PENDING,
        shareFormId: form.id,
        platformId: dto.platformId,
        categoryId,
        orderedAt: this.orderedAt(
          this.visibleValue(config, 'orderedAt', dto.orderedAt, undefined),
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
          this.visibleValue(config, 'platformOrderNo', dto.platformOrderNo, ''),
        ),
        dispatchStatus,
        inboundTrackingNo,
        purchaseAddress: this.clean(
          this.visibleValue(config, 'purchaseAddress', dto.purchaseAddress, ''),
        ),
        receiverName,
        fundingType: safeFundingType,
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
        customData:
          amountFormulas && Object.keys(amountFormulas).length
            ? ({ amountFormulas } as Prisma.InputJsonValue)
            : undefined,
        notes: this.clean(this.visibleValue(config, 'notes', dto.notes, '')),
      },
    };
  }

  private async assertSubmissionLimit(
    transaction: Prisma.TransactionClient,
    form: { id: string; submissionLimit: number | null },
  ) {
    if (form.submissionLimit === null) return;
    const count = await transaction.order.count({
      where: { shareFormId: form.id, deletedAt: null },
    });
    if (count >= form.submissionLimit) {
      throw new GoneException('该登记链接已达到提交上限');
    }
  }

  private async writeSubmissionAuditLog(
    transaction: Prisma.TransactionClient,
    order: {
      id: string;
      serialNo: number;
      reviewStatus: ReviewStatus;
      platformId: string;
      platformOrderNo: string | null;
    },
    identity: ResolvedPublicIdentity,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
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
          externalIdentityId: identity.id,
          platformId: order.platformId,
          platformOrderNo: order.platformOrderNo,
          reviewStatus: order.reviewStatus,
        },
      },
    });
  }

  private mapOrderWriteError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('平台订单号已经登记');
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return new ConflictException('同时提交人数较多，请重新提交');
    }
    return error;
  }

  /**
   * 批量报单：逐条复用单笔提交的完整校验逻辑（字段权限、必填、重复订单号、提交上限等），
   * 允许部分成功，失败行返回原因并保留在预览区供修正后单独重提。
   */
  async createBatch(
    publicToken: string,
    identity: ResolvedPublicIdentity,
    dto: CreatePublicOrdersBatchDto,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, true);
    if (!form.scheme.enabled) {
      throw new GoneException('该方案当前已停用，暂不能提交新报单');
    }

    const config = this.config(form.fieldConfig);

    const results: Array<
      | { index: number; success: true; id: string; serialNo: number }
      | { index: number; success: false; message: string }
    > = [];

    // 第一步：逐条预校验，校验失败的行直接标记原因，不进入写库阶段。
    const preparedItems: Array<{
      index: number;
      nickname: string | null;
      data: Awaited<ReturnType<PublicFormsService['prepareOrder']>>['data'];
    }> = [];

    for (const [index, item] of dto.items.entries()) {
      try {
        const validated = await this.validateBatchItem(item);
        const prepared = await this.prepareOrder(form, config, validated);
        preparedItems.push({
          index,
          nickname: prepared.nickname,
          data: prepared.data,
        });
      } catch (error) {
        results.push({
          index,
          success: false,
          message: this.batchErrorMessage(error),
        });
      }
    }

    // 第二步：查重。本批内部重复、或库里已经登记的，先标记出来。
    const duplicateIndexes =
      await this.findDuplicateOrderIndexes(preparedItems);
    const insertable = preparedItems.filter(
      (item) => !duplicateIndexes.has(item.index),
    );
    for (const item of preparedItems) {
      if (!duplicateIndexes.has(item.index)) continue;
      results.push({
        index: item.index,
        success: false,
        message: '平台订单号已经登记',
      });
    }

    // 第三步：剩下的条目一次性写入。
    const createdOrderIds: string[] = [];
    if (insertable.length) {
      try {
        const created = await this.prisma.$transaction(
          async (transaction) => {
            await this.assertSubmissionLimit(transaction, form);
            const submitter = await this.resolveOrderSubmitter(
              transaction,
              identity,
              insertable[0].nickname,
            );
            const orders = [];
            for (const item of insertable) {
              const order = await transaction.order.create({
                data: {
                  ...item.data,
                  externalIdentityId: identity.id,
                  submitterId: submitter.id,
                },
              });
              await this.writeSubmissionAuditLog(
                transaction,
                order,
                identity,
                requestMetadata,
              );
              orders.push(order);
            }
            return orders;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        for (const [position, order] of created.entries()) {
          createdOrderIds.push(order.id);
          results.push({
            index: insertable[position].index,
            success: true,
            id: order.id,
            serialNo: order.serialNo,
          });
        }
      } catch (error) {
        const message = this.batchErrorMessage(this.mapOrderWriteError(error));
        for (const item of insertable) {
          results.push({ index: item.index, success: false, message });
        }
      }
    }

    if (createdOrderIds.length) {
      await this.notifications.notifyOrderEvent(
        'ORDER_BATCH_SUBMITTED',
        createdOrderIds,
        { requestMetadata },
      );
    }

    results.sort((left, right) => left.index - right.index);
    const successCount = results.filter((item) => item.success).length;
    return {
      total: dto.items.length,
      successCount,
      failureCount: dto.items.length - successCount,
      results,
    };
  }

  /**
   * 找出本批次中平台订单号重复的行：既包含本次提交内部重复，也包含库里已经登记的。
   */
  private async findDuplicateOrderIndexes(
    preparedItems: Array<{
      index: number;
      data: { platformId: string; platformOrderNo: string | null };
    }>,
  ) {
    const duplicates = new Set<number>();
    const seen = new Set<string>();
    const platformIds = new Set<string>();
    const orderNos = new Set<string>();

    for (const item of preparedItems) {
      const orderNo = item.data.platformOrderNo;
      if (!orderNo) continue;
      const key = `${item.data.platformId}::${orderNo}`;
      if (seen.has(key)) {
        duplicates.add(item.index);
        continue;
      }
      seen.add(key);
      platformIds.add(item.data.platformId);
      orderNos.add(orderNo);
    }

    if (!orderNos.size) return duplicates;

    const existing = await this.prisma.order.findMany({
      where: {
        platformId: { in: [...platformIds] },
        platformOrderNo: { in: [...orderNos] },
        deletedAt: null,
      },
      select: { platformId: true, platformOrderNo: true },
    });
    const existingKeys = new Set(
      existing.map((row) => `${row.platformId}::${row.platformOrderNo ?? ''}`),
    );
    for (const item of preparedItems) {
      const orderNo = item.data.platformOrderNo;
      if (!orderNo) continue;
      if (existingKeys.has(`${item.data.platformId}::${orderNo}`)) {
        duplicates.add(item.index);
      }
    }
    return duplicates;
  }

  private batchErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      const payload = response as { message?: unknown };
      if (Array.isArray(payload.message)) {
        return payload.message.join('；');
      }
      if (typeof payload.message === 'string') return payload.message;
      return error.message;
    }
    return '提交失败，请稍后重试';
  }

  async listMine(publicToken: string, identity: ResolvedPublicIdentity) {
    const form = await this.getForm(publicToken, false);
    const ownershipWhere = identity.submitterId
      ? { submitterId: identity.submitterId }
      : { externalIdentityId: identity.id };
    const items = await this.prisma.order.findMany({
      where: {
        shareFormId: form.id,
        ...ownershipWhere,
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
      dispatchStatus: order.dispatchStatus,
      inboundTrackingNo: order.inboundTrackingNo,
      purchaseAddress: order.purchaseAddress,
      receiverName: order.receiverName,
      fundingType: order.fundingType,
      orderAmount: order.orderAmount,
      paymentDiscountAmount: order.paymentDiscountAmount,
      rebateScanned: order.rebateScanned,
      submitterSettlementAmount: order.submitterSettlementAmount,
      submitterSettlementStatus: order.submitterSettlementStatus,
      notes: order.notes,
      amountFormulas: amountFormulasFromCustomData(
        order.customData,
        PUBLIC_AMOUNT_FORMULA_KEYS,
      ),
      createdAt: order.createdAt,
      canEdit:
        order.reviewStatus === ReviewStatus.REJECTED ||
        (form.allowEditBeforeApproval &&
          order.reviewStatus === ReviewStatus.PENDING) ||
        // 管理员误点确认后退回待确认的订单，下单人可以再次修改
        (order.revertedAt !== null &&
          order.reviewStatus === ReviewStatus.PENDING),
      canDelete:
        order.reviewStatus === ReviewStatus.REJECTED ||
        (form.allowDeleteBeforeApproval &&
          order.reviewStatus === ReviewStatus.PENDING),
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
    const ownershipWhere = identity.submitterId
      ? { submitterId: identity.submitterId }
      : { externalIdentityId: identity.id };
    const existing = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        shareFormId: form.id,
        ...ownershipWhere,
        deletedAt: null,
      },
      include: {
        platform: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    if (!existing) throw new NotFoundException('登记记录不存在');
    if (
      existing.reviewStatus !== ReviewStatus.PENDING &&
      existing.reviewStatus !== ReviewStatus.REJECTED
    ) {
      throw new ForbiddenException('管理员确认后不能再修改');
    }
    if (
      existing.reviewStatus === ReviewStatus.PENDING &&
      !form.allowEditBeforeApproval &&
      !existing.revertedAt
    ) {
      throw new ForbiddenException('管理员未开放提交后的修改权限');
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
      dispatchStatus: editableValue(
        'dispatchStatus',
        dto.dispatchStatus,
        existing.dispatchStatus,
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
      receiverName: editableValue(
        'receiverName',
        dto.receiverName,
        existing.receiverName ?? '',
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
    merged.dispatchStatus = this.syncDispatchStatusWithTracking(
      merged.inboundTrackingNo,
      merged.dispatchStatus ?? existing.dispatchStatus,
    );
    this.assertRequiredFields(config, merged);

    const existingCustomData = existing.customData;
    let customData: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (dto.amountFormulas !== undefined) {
      const currentData =
        existingCustomData &&
        typeof existingCustomData === 'object' &&
        !Array.isArray(existingCustomData)
          ? { ...(existingCustomData as Record<string, unknown>) }
          : {};
      const currentFormulas =
        currentData.amountFormulas &&
        typeof currentData.amountFormulas === 'object' &&
        !Array.isArray(currentData.amountFormulas)
          ? { ...(currentData.amountFormulas as Record<string, string>) }
          : {};
      for (const [key, formula] of Object.entries(
        this.amountFormulas(config, dto.amountFormulas) ?? {},
      )) {
        if (formula) currentFormulas[key] = formula;
        else delete currentFormulas[key];
      }
      if (Object.keys(currentFormulas).length) {
        currentData.amountFormulas = currentFormulas;
      } else {
        delete currentData.amountFormulas;
      }
      customData = Object.keys(currentData).length
        ? (currentData as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

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

    let updatedResult: { id: string; updatedAt: Date };
    try {
      updatedResult = await this.prisma.$transaction(async (transaction) => {
        const submitter = await this.resolveOrderSubmitter(
          transaction,
          identity,
          this.clean(merged.wechatNickname),
        );
        const updated = await transaction.order.update({
          where: { id: existing.id },
          data: {
            reviewStatus: ReviewStatus.PENDING,
            approvedAt: null,
            approvedById: null,
            platformId: merged.platformId,
            categoryId: merged.categoryId ?? null,
            submitterId: submitter.id,
            submitterWechatNickname: this.clean(merged.wechatNickname),
            productNameSnapshot: this.clean(merged.productName) ?? '',
            orderedAt: this.orderedAt(merged.orderedAt),
            platformOrderNo: this.clean(merged.platformOrderNo),
            dispatchStatus: merged.dispatchStatus,
            inboundTrackingNo: this.clean(merged.inboundTrackingNo),
            purchaseAddress: this.clean(merged.purchaseAddress),
            receiverName: this.clean(merged.receiverName),
            fundingType: merged.fundingType,
            orderAmount: merged.orderAmount,
            paymentDiscountAmount: merged.paymentDiscountAmount,
            rebateScanned: merged.rebateScanned,
            submitterSettlementAmount: this.settlementAmount(
              config,
              merged.submitterSettlementAmount,
            ),
            ...(dto.amountFormulas !== undefined ? { customData } : {}),
            notes: this.clean(merged.notes),
          },
        });
        await transaction.auditLog.create({
          data: {
            source: 'PUBLIC_FORM',
            action:
              existing.reviewStatus === ReviewStatus.REJECTED
                ? 'ORDER_RESUBMITTED_AFTER_REJECTION'
                : 'ORDER_UPDATED_BEFORE_APPROVAL',
            entityType: 'Order',
            entityId: updated.id,
            ipAddress: requestMetadata.ipAddress,
            userAgent: requestMetadata.userAgent,
            beforeData: {
              reviewStatus: existing.reviewStatus,
              platformId: existing.platformId,
              platformOrderNo: existing.platformOrderNo,
              orderAmount: existing.orderAmount.toString(),
              submitterSettlementAmount:
                existing.submitterSettlementAmount.toString(),
            },
            afterData: {
              reviewStatus: updated.reviewStatus,
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

    const beforeSnapshot = buildOrderChangeSnapshot({
      productNameSnapshot: existing.productNameSnapshot,
      platformOrderNo: existing.platformOrderNo,
      platformName: existing.platform?.name,
      categoryName: existing.category?.name,
      fundingType: existing.fundingType,
      orderedAt: existing.orderedAt,
      receiverName: existing.receiverName,
      purchaseAddress: existing.purchaseAddress,
      inboundTrackingNo: existing.inboundTrackingNo,
      orderAmount: existing.orderAmount,
      submitterSettlementAmount: existing.submitterSettlementAmount,
      paymentDiscountAmount: existing.paymentDiscountAmount,
      rebateScanned: existing.rebateScanned,
      dispatchStatus: existing.dispatchStatus,
      notes: existing.notes,
    });
    const afterSnapshot =
      await this.notifications.buildOrderChangeSnapshot(updatedResult.id);
    const changes = diffOrderChanges(beforeSnapshot, afterSnapshot);
    await this.notifications.notifyOrderEvent(
      'ORDER_UPDATED_BY_SUBMITTER',
      [updatedResult.id],
      { changes, requestMetadata },
    );
    return updatedResult;
  }

  async deleteMine(
    publicToken: string,
    orderId: string,
    identity: ResolvedPublicIdentity,
    requestMetadata: { ipAddress?: string; userAgent?: string },
  ) {
    const form = await this.getForm(publicToken, false);
    const ownershipWhere = identity.submitterId
      ? { submitterId: identity.submitterId }
      : { externalIdentityId: identity.id };
    const existing = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        shareFormId: form.id,
        ...ownershipWhere,
        deletedAt: null,
      },
    });
    if (!existing) throw new NotFoundException('登记记录不存在');
    const canDelete =
      existing.reviewStatus === ReviewStatus.REJECTED ||
      (existing.reviewStatus === ReviewStatus.PENDING &&
        form.allowDeleteBeforeApproval);
    if (!canDelete) {
      throw new ForbiddenException('该订单当前不能删除');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.order.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          source: 'PUBLIC_FORM',
          action: 'ORDER_DELETED_BY_SUBMITTER',
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
    await this.notifications.notifyOrderEvent(
      'ORDER_DELETED_BY_SUBMITTER',
      [existing.id],
      { requestMetadata },
    );
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
