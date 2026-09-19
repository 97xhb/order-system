import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomFieldScope,
  FundingType,
  Prisma,
  ProfitRuleScope,
  ProfitRuleStatus,
  ReviewStatus,
  SettlementStatus,
  ShipmentStatus,
} from '@prisma/client';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertProfitRuleDefinition,
  calculateProfitByRule,
  calculateSettledProfit,
  DEFAULT_PROFIT_RULE_DEFINITION,
  ProfitRuleDefinition,
} from './profit-calculator';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { CreateAdminOrdersBatchDto } from './dto/create-admin-orders-batch.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ReviewOrderDto } from './dto/review-order.dto';
import { UpdateAdminOrderDto } from './dto/update-admin-order.dto';
import { UpdateOrderProgressDto } from './dto/update-order-progress.dto';
import { normalizeOrderSettlementStatus } from './order-statuses';
import {
  calculateScanRebateAmount,
  inferScanAmountFromRebate,
} from './scan-rebate';
import { orderTableFieldOptions } from '../submitters/payout-query-fields';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(value: string | undefined | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private auditReason(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const reason = (value as Prisma.JsonObject).reason;
    if (typeof reason !== 'string') return null;
    const normalized = this.clean(reason);
    return normalized === '管理员完整编辑订单' ? null : normalized;
  }

  private date(value: string) {
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('下单日期格式不正确');
    }
    return parsed;
  }

  private hasBeenShipped(status: ShipmentStatus) {
    return (
      status === ShipmentStatus.SHIPPED || status === ShipmentStatus.DELIVERED
    );
  }

  private ids(value: string | undefined) {
    return value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private ruleDefinition(value: Prisma.JsonValue): ProfitRuleDefinition {
    assertProfitRuleDefinition(value);
    return value;
  }

  private async resolveProfitRule(
    transaction: Prisma.TransactionClient,
    order: {
      schemeId: string | null;
      categoryId: string | null;
      fundingType: FundingType;
    },
  ) {
    const rules = await transaction.profitRule.findMany({
      where: {
        status: ProfitRuleStatus.ACTIVE,
        OR: [
          ...(order.schemeId
            ? [{ scope: ProfitRuleScope.SCHEME, schemeId: order.schemeId }]
            : []),
          ...(order.categoryId
            ? [
                {
                  scope: ProfitRuleScope.CATEGORY,
                  categoryId: order.categoryId,
                },
              ]
            : []),
          {
            scope: ProfitRuleScope.FUNDING_TYPE,
            fundingType: order.fundingType,
          },
          { scope: ProfitRuleScope.GLOBAL },
        ],
      },
    });
    const priority = [
      ProfitRuleScope.SCHEME,
      ProfitRuleScope.CATEGORY,
      ProfitRuleScope.FUNDING_TYPE,
      ProfitRuleScope.GLOBAL,
    ];
    return rules.sort(
      (left, right) =>
        priority.indexOf(left.scope) - priority.indexOf(right.scope),
    )[0];
  }

  private async profitData(
    transaction: Prisma.TransactionClient,
    order: {
      schemeId: string | null;
      categoryId: string | null;
      fundingType: FundingType;
      receivableStatus: SettlementStatus;
      saleAmount: Prisma.Decimal;
      customerReceivedAmount: Prisma.Decimal;
      orderAmount: Prisma.Decimal;
      submitterSettlementAmount: Prisma.Decimal;
      submitterPaidAmount: Prisma.Decimal;
      paymentDiscountAmount: Prisma.Decimal;
      platformRebateAmount: Prisma.Decimal;
      shippingCostAmount: Prisma.Decimal;
      serviceFeeAmount: Prisma.Decimal;
      otherIncomeAmount: Prisma.Decimal;
      otherCostAmount: Prisma.Decimal;
      profitAdjustment: Prisma.Decimal;
    },
  ) {
    const rule = await this.resolveProfitRule(transaction, order);
    const definition = rule
      ? this.ruleDefinition(rule.definition)
      : DEFAULT_PROFIT_RULE_DEFINITION;
    const requiresFullCustomerPayment =
      rule?.requiresFullCustomerPayment ?? true;
    const input = {
      receivableStatus: order.receivableStatus,
      saleAmount: order.saleAmount,
      customerReceivedAmount: order.customerReceivedAmount,
      orderAmount: order.orderAmount,
      submitterSettlementAmount: order.submitterSettlementAmount,
      submitterPaidAmount: order.submitterPaidAmount,
      paymentDiscountAmount: order.paymentDiscountAmount,
      platformRebateAmount: order.platformRebateAmount,
      shippingCostAmount: order.shippingCostAmount,
      serviceFeeAmount: order.serviceFeeAmount,
      otherIncomeAmount: order.otherIncomeAmount,
      otherCostAmount: order.otherCostAmount,
      profitAdjustment: order.profitAdjustment,
    };
    const expectedProfit = calculateProfitByRule(
      {
        ...input,
        receivableStatus: SettlementStatus.PAID,
        customerReceivedAmount: order.saleAmount,
      },
      definition,
    );
    const settledProfit = calculateSettledProfit(input, {
      definition,
      requiresFullCustomerPayment,
    });

    return {
      profitRuleId: rule?.id ?? null,
      profitRuleVersion: rule?.version ?? null,
      profitRuleSnapshot: {
        source: rule ? 'CONFIGURED' : 'SYSTEM_DEFAULT',
        id: rule?.id ?? null,
        name: rule?.name ?? '系统默认利润规则',
        version: rule?.version ?? 1,
        definition,
        requiresFullCustomerPayment,
      } as unknown as Prisma.InputJsonValue,
      expectedProfit,
      settledProfit,
    };
  }

  private profitDataFromSnapshot(order: {
    profitRuleSnapshot: Prisma.JsonValue | null;
    receivableStatus: SettlementStatus;
    saleAmount: Prisma.Decimal;
    customerReceivedAmount: Prisma.Decimal;
    orderAmount: Prisma.Decimal;
    submitterSettlementAmount: Prisma.Decimal;
    submitterPaidAmount: Prisma.Decimal;
    paymentDiscountAmount: Prisma.Decimal;
    platformRebateAmount: Prisma.Decimal;
    shippingCostAmount: Prisma.Decimal;
    serviceFeeAmount: Prisma.Decimal;
    otherIncomeAmount: Prisma.Decimal;
    otherCostAmount: Prisma.Decimal;
    profitAdjustment: Prisma.Decimal;
  }) {
    const snapshot =
      order.profitRuleSnapshot && typeof order.profitRuleSnapshot === 'object'
        ? (order.profitRuleSnapshot as {
            definition?: unknown;
            requiresFullCustomerPayment?: unknown;
          })
        : null;
    let definition = DEFAULT_PROFIT_RULE_DEFINITION;
    if (snapshot?.definition) {
      definition = this.ruleDefinition(snapshot.definition as Prisma.JsonValue);
    }
    const requiresFullCustomerPayment =
      typeof snapshot?.requiresFullCustomerPayment === 'boolean'
        ? snapshot.requiresFullCustomerPayment
        : true;
    const input = {
      receivableStatus: order.receivableStatus,
      saleAmount: order.saleAmount,
      customerReceivedAmount: order.customerReceivedAmount,
      orderAmount: order.orderAmount,
      submitterSettlementAmount: order.submitterSettlementAmount,
      submitterPaidAmount: order.submitterPaidAmount,
      paymentDiscountAmount: order.paymentDiscountAmount,
      platformRebateAmount: order.platformRebateAmount,
      shippingCostAmount: order.shippingCostAmount,
      serviceFeeAmount: order.serviceFeeAmount,
      otherIncomeAmount: order.otherIncomeAmount,
      otherCostAmount: order.otherCostAmount,
      profitAdjustment: order.profitAdjustment,
    };

    return {
      expectedProfit: calculateProfitByRule(
        {
          ...input,
          receivableStatus: SettlementStatus.PAID,
          customerReceivedAmount: order.saleAmount,
        },
        definition,
      ),
      settledProfit: calculateSettledProfit(input, {
        definition,
        requiresFullCustomerPayment,
      }),
    };
  }

  private deriveSettlementStatus(target: Prisma.Decimal, paid: Prisma.Decimal) {
    if (target.lessThanOrEqualTo(0)) return SettlementStatus.PAID;
    return paid.greaterThanOrEqualTo(target)
      ? SettlementStatus.PAID
      : SettlementStatus.UNPAID;
  }

  private amountForManualStatus(
    status: SettlementStatus | undefined,
    submittedAmount: number | undefined,
    currentAmount: Prisma.Decimal,
    targetAmount: Prisma.Decimal,
  ) {
    if (status === SettlementStatus.PAID) return targetAmount;
    if (status === SettlementStatus.UNPAID) return new Prisma.Decimal(0);
    if (submittedAmount !== undefined) {
      return new Prisma.Decimal(submittedAmount);
    }
    return currentAmount;
  }

  private scanRebateData(
    dto: Pick<
      CreateAdminOrderDto,
      'scanAmount' | 'platformRebateAmount' | 'rebateScanned'
    >,
    existing?: {
      rebateScanned: boolean | null;
      scanAmount: Prisma.Decimal;
      platformRebateAmount: Prisma.Decimal;
    },
  ) {
    const submittedScanAmount =
      dto.scanAmount === undefined ? null : new Prisma.Decimal(dto.scanAmount);
    const legacyRebateAmount = new Prisma.Decimal(
      dto.platformRebateAmount ?? existing?.platformRebateAmount ?? 0,
    );
    const rebateScanned =
      dto.rebateScanned ??
      (submittedScanAmount
        ? submittedScanAmount.greaterThan(0)
        : (existing?.rebateScanned ?? legacyRebateAmount.greaterThan(0)));

    if (!rebateScanned) {
      return {
        rebateScanned: false,
        scanAmount: new Prisma.Decimal(0),
        platformRebateAmount: new Prisma.Decimal(0),
      };
    }

    if (submittedScanAmount) {
      if (submittedScanAmount.lessThanOrEqualTo(0)) {
        throw new BadRequestException('选择扫码后必须填写大于 0 的扫码金额');
      }
      return {
        rebateScanned: true,
        scanAmount: submittedScanAmount,
        platformRebateAmount: calculateScanRebateAmount(submittedScanAmount),
      };
    }

    if (existing?.scanAmount.greaterThan(0)) {
      return {
        rebateScanned: true,
        scanAmount: existing.scanAmount,
        platformRebateAmount: calculateScanRebateAmount(existing.scanAmount),
      };
    }

    if (legacyRebateAmount.greaterThan(0)) {
      return {
        rebateScanned: true,
        scanAmount: inferScanAmountFromRebate(legacyRebateAmount),
        platformRebateAmount: legacyRebateAmount,
      };
    }

    throw new BadRequestException('选择扫码后必须填写扫码金额');
  }

  async create(dto: CreateAdminOrderDto, admin: AuthenticatedAdmin) {
    const accountName = dto.accountName.trim();
    if (!accountName) throw new BadRequestException('下单账号不能为空');
    const platform = await this.prisma.platform.findFirst({
      where: { id: dto.platformId, enabled: true },
    });
    if (!platform) throw new BadRequestException('选择的下单平台不可用');

    const scheme = dto.schemeId
      ? await this.prisma.orderScheme.findUnique({
          where: { id: dto.schemeId },
        })
      : null;
    if (dto.schemeId && !scheme) {
      throw new BadRequestException('选择的下单方案不存在');
    }
    if (
      dto.categoryId &&
      !(await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      }))
    ) {
      throw new BadRequestException('选择的品类不存在');
    }
    const productName = dto.productName.trim() || scheme?.productName;
    if (!productName) throw new BadRequestException('商品名称不能为空');
    const fundingTypeOther =
      dto.fundingType === FundingType.OTHER
        ? this.clean(dto.fundingTypeOther)
        : null;
    if (dto.fundingType === FundingType.OTHER && !fundingTypeOther) {
      throw new BadRequestException('选择其他支付方式时必须填写具体说明');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        let submitter = dto.accountId
          ? await transaction.submitter.findUnique({
              where: { id: dto.accountId },
            })
          : await transaction.submitter.findFirst({
              where: { name: accountName },
              orderBy: { createdAt: 'asc' },
            });

        if (submitter) {
          if (submitter.status !== 'ACTIVE') {
            throw new BadRequestException('选择的下单人已停用');
          }
        } else {
          submitter = await transaction.submitter.create({
            data: {
              name: accountName,
              nickname: accountName,
            },
          });
          await transaction.auditLog.create({
            data: {
              actorAdminId: admin.id,
              source: 'ADMIN_WEB',
              action: 'ORDER_SUBMITTER_AUTO_CREATED',
              entityType: 'Submitter',
              entityId: submitter.id,
              afterData: {
                platformId: dto.platformId,
                accountName,
              },
            },
          });
        }

        const scanRebate = this.scanRebateData(dto);
        const amountData = {
          schemeId: scheme?.id ?? null,
          categoryId: dto.categoryId ?? scheme?.categoryId ?? null,
          fundingType: dto.fundingType,
          receivableStatus: SettlementStatus.UNPAID,
          saleAmount: new Prisma.Decimal(dto.saleAmount ?? 0),
          customerReceivedAmount: new Prisma.Decimal(0),
          orderAmount: new Prisma.Decimal(dto.orderAmount ?? 0),
          submitterSettlementAmount: new Prisma.Decimal(
            dto.submitterSettlementAmount ?? 0,
          ),
          submitterPaidAmount: new Prisma.Decimal(0),
          paymentDiscountAmount: new Prisma.Decimal(
            dto.paymentDiscountAmount ?? 0,
          ),
          platformRebateAmount: scanRebate.platformRebateAmount,
          shippingCostAmount: new Prisma.Decimal(dto.shippingCostAmount ?? 0),
          serviceFeeAmount: new Prisma.Decimal(dto.serviceFeeAmount ?? 0),
          otherIncomeAmount: new Prisma.Decimal(dto.otherIncomeAmount ?? 0),
          otherCostAmount: new Prisma.Decimal(dto.otherCostAmount ?? 0),
          profitAdjustment: new Prisma.Decimal(dto.profitAdjustment ?? 0),
        };
        const profit = await this.profitData(transaction, amountData);
        const order = await transaction.order.create({
          data: {
            source: 'ADMIN',
            reviewStatus: ReviewStatus.APPROVED,
            submitterId: submitter.id,
            platformId: dto.platformId,
            categoryId: amountData.categoryId,
            schemeId: amountData.schemeId,
            profitRuleId: profit.profitRuleId,
            orderedAt: this.date(dto.orderedAt),
            productNameSnapshot: productName,
            schemeNameSnapshot:
              this.clean(dto.schemeName) ?? scheme?.name ?? null,
            submitterWechatNickname: this.clean(dto.wechatNickname),
            rebateScanned: scanRebate.rebateScanned,
            platformOrderNo: this.clean(dto.platformOrderNo),
            inboundTrackingNo: this.clean(dto.inboundTrackingNo),
            purchaseAddress: this.clean(dto.purchaseAddress),
            fundingType: dto.fundingType,
            orderAmount: amountData.orderAmount,
            paymentDiscountAmount: amountData.paymentDiscountAmount,
            submitterSettlementAmount: amountData.submitterSettlementAmount,
            scanAmount: scanRebate.scanAmount,
            platformRebateAmount: amountData.platformRebateAmount,
            saleAmount: amountData.saleAmount,
            shippingCostAmount: amountData.shippingCostAmount,
            serviceFeeAmount: amountData.serviceFeeAmount,
            otherIncomeAmount: amountData.otherIncomeAmount,
            otherCostAmount: amountData.otherCostAmount,
            expectedProfit: profit.expectedProfit,
            settledProfit: profit.settledProfit,
            profitAdjustment: amountData.profitAdjustment,
            profitAdjustmentReason: this.clean(dto.profitAdjustmentReason),
            profitRuleVersion: profit.profitRuleVersion,
            profitRuleSnapshot: profit.profitRuleSnapshot,
            notes: this.clean(dto.notes),
            customData: fundingTypeOther
              ? ({ fundingTypeOther } as Prisma.InputJsonValue)
              : undefined,
            approvedAt: new Date(),
            approvedById: admin.id,
            createdById: admin.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorAdminId: admin.id,
            source: 'ADMIN_WEB',
            action: 'ORDER_CREATED',
            entityType: 'Order',
            entityId: order.id,
            afterData: {
              serialNo: order.serialNo,
              source: order.source,
              platformId: order.platformId,
              platformOrderNo: order.platformOrderNo,
              submitterId: order.submitterId,
              reviewStatus: order.reviewStatus,
              fundingType: order.fundingType,
              fundingTypeOther,
              expectedProfit: order.expectedProfit.toString(),
            },
          },
        });
        return order;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('该平台订单号已经存在');
      }
      throw error;
    }
  }

  async createBatch(dto: CreateAdminOrdersBatchDto, admin: AuthenticatedAdmin) {
    const results: Array<
      | { index: number; success: true; id: string; serialNo: number }
      | { index: number; success: false; message: string }
    > = [];

    for (const [index, orderDto] of dto.orders.entries()) {
      try {
        const order = await this.create(orderDto, admin);
        results.push({
          index,
          success: true,
          id: order.id,
          serialNo: order.serialNo,
        });
      } catch (error) {
        results.push({
          index,
          success: false,
          message: this.batchErrorMessage(error),
        });
      }
    }

    const successCount = results.filter((item) => item.success).length;
    return {
      total: dto.orders.length,
      successCount,
      failureCount: dto.orders.length - successCount,
      results,
    };
  }

  private batchErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message.join('；');
        if (message) return message;
      }
    }
    return error instanceof Error ? error.message : '订单保存失败';
  }

  async update(
    id: string,
    dto: UpdateAdminOrderDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        submitter: { select: { id: true, name: true } },
        shipmentLink: {
          include: {
            shipment: {
              select: { id: true, trackingNo: true, shippedAt: true },
            },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('订单不存在');

    const platformId = dto.platformId ?? existing.platformId;
    const platform = await this.prisma.platform.findFirst({
      where: {
        id: platformId,
        ...(platformId === existing.platformId ? {} : { enabled: true }),
      },
    });
    if (!platform) throw new BadRequestException('选择的下单平台不可用');

    const schemeId =
      dto.schemeId === undefined ? existing.schemeId : dto.schemeId;
    const scheme = schemeId
      ? await this.prisma.orderScheme.findUnique({ where: { id: schemeId } })
      : null;
    if (schemeId && !scheme)
      throw new BadRequestException('选择的下单方案不存在');

    const categoryId =
      dto.categoryId === undefined ? existing.categoryId : dto.categoryId;
    if (
      categoryId &&
      !(await this.prisma.category.findUnique({ where: { id: categoryId } }))
    ) {
      throw new BadRequestException('选择的品类不存在');
    }

    const accountName = (dto.accountName ?? existing.submitter.name).trim();
    if (!accountName) throw new BadRequestException('下单账号不能为空');
    const productName = (
      dto.productName ?? existing.productNameSnapshot
    ).trim();
    if (!productName) throw new BadRequestException('商品名称不能为空');
    const fundingType = dto.fundingType ?? existing.fundingType;
    const requestedShipmentStatus =
      dto.shipmentStatus ?? existing.shipmentStatus;
    const shipmentTrackingNo =
      dto.shipmentTrackingNo === undefined
        ? undefined
        : this.clean(dto.shipmentTrackingNo);
    const fundingTypeOther =
      fundingType === FundingType.OTHER
        ? (this.clean(dto.fundingTypeOther) ??
          this.clean(
            existing.customData &&
              typeof existing.customData === 'object' &&
              !Array.isArray(existing.customData)
              ? String(
                  (existing.customData as Record<string, unknown>)
                    .fundingTypeOther ?? '',
                )
              : undefined,
          ))
        : null;
    if (fundingType === FundingType.OTHER && !fundingTypeOther) {
      throw new BadRequestException('选择其他支付方式时必须填写具体说明');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        let submitter = dto.accountId
          ? await transaction.submitter.findUnique({
              where: { id: dto.accountId },
            })
          : await transaction.submitter.findFirst({
              where: { name: accountName },
              orderBy: { createdAt: 'asc' },
            });
        if (submitter) {
          if (submitter.status !== 'ACTIVE') {
            throw new BadRequestException('选择的下单人已停用');
          }
        } else {
          submitter = await transaction.submitter.create({
            data: {
              name: accountName,
              nickname: accountName,
            },
          });
          await transaction.auditLog.create({
            data: {
              actorAdminId: admin.id,
              source: 'ADMIN_WEB',
              action: 'ORDER_SUBMITTER_AUTO_CREATED',
              entityType: 'Submitter',
              entityId: submitter.id,
              afterData: { platformId, accountName },
            },
          });
        }

        const saleAmount = new Prisma.Decimal(
          dto.saleAmount ?? existing.saleAmount,
        );
        const submitterSettlementAmount = new Prisma.Decimal(
          dto.submitterSettlementAmount ?? existing.submitterSettlementAmount,
        );
        const requestedReceivableStatus = normalizeOrderSettlementStatus(
          dto.receivableStatus,
        );
        const requestedSubmitterSettlementStatus =
          normalizeOrderSettlementStatus(dto.submitterSettlementStatus);
        const customerReceivedAmount = this.amountForManualStatus(
          requestedReceivableStatus,
          dto.customerReceivedAmount,
          existing.customerReceivedAmount,
          saleAmount,
        );
        const submitterPaidAmount = this.amountForManualStatus(
          requestedSubmitterSettlementStatus,
          dto.submitterPaidAmount,
          existing.submitterPaidAmount,
          submitterSettlementAmount,
        );
        const receivableStatus =
          requestedReceivableStatus ??
          this.deriveSettlementStatus(saleAmount, customerReceivedAmount);
        const shipmentStatus =
          receivableStatus === SettlementStatus.PAID
            ? ShipmentStatus.DELIVERED
            : requestedShipmentStatus;
        const submitterSettlementStatus =
          requestedSubmitterSettlementStatus ??
          this.deriveSettlementStatus(
            submitterSettlementAmount,
            submitterPaidAmount,
          );

        const scanRebate = this.scanRebateData(dto, existing);
        const amountData = {
          ...existing,
          schemeId,
          categoryId,
          fundingType,
          receivableStatus,
          saleAmount,
          customerReceivedAmount,
          orderAmount: new Prisma.Decimal(
            dto.orderAmount ?? existing.orderAmount,
          ),
          submitterSettlementAmount,
          submitterPaidAmount,
          paymentDiscountAmount: new Prisma.Decimal(
            dto.paymentDiscountAmount ?? existing.paymentDiscountAmount,
          ),
          platformRebateAmount: scanRebate.platformRebateAmount,
          shippingCostAmount: new Prisma.Decimal(
            dto.shippingCostAmount ?? existing.shippingCostAmount,
          ),
          serviceFeeAmount: new Prisma.Decimal(
            dto.serviceFeeAmount ?? existing.serviceFeeAmount,
          ),
          otherIncomeAmount: new Prisma.Decimal(
            dto.otherIncomeAmount ?? existing.otherIncomeAmount,
          ),
          otherCostAmount: new Prisma.Decimal(
            dto.otherCostAmount ?? existing.otherCostAmount,
          ),
          profitAdjustment: new Prisma.Decimal(
            dto.profitAdjustment ?? existing.profitAdjustment,
          ),
        };
        const profit = this.profitDataFromSnapshot(amountData);
        const existingCustomData =
          existing.customData &&
          typeof existing.customData === 'object' &&
          !Array.isArray(existing.customData)
            ? { ...(existing.customData as Record<string, unknown>) }
            : {};
        if (fundingTypeOther)
          existingCustomData.fundingTypeOther = fundingTypeOther;
        else delete existingCustomData.fundingTypeOther;

        const order = await transaction.order.update({
          where: { id },
          data: {
            submitterId: submitter.id,
            platformId,
            categoryId,
            schemeId,
            orderedAt: dto.orderedAt ? this.date(dto.orderedAt) : undefined,
            productNameSnapshot: productName,
            schemeNameSnapshot:
              dto.schemeName === undefined
                ? existing.schemeNameSnapshot
                : (this.clean(dto.schemeName) ?? scheme?.name ?? null),
            submitterWechatNickname:
              dto.wechatNickname === undefined
                ? existing.submitterWechatNickname
                : this.clean(dto.wechatNickname),
            rebateScanned: scanRebate.rebateScanned,
            platformOrderNo:
              dto.platformOrderNo === undefined
                ? existing.platformOrderNo
                : this.clean(dto.platformOrderNo),
            inboundTrackingNo:
              dto.inboundTrackingNo === undefined
                ? existing.inboundTrackingNo
                : this.clean(dto.inboundTrackingNo),
            purchaseAddress:
              dto.purchaseAddress === undefined
                ? existing.purchaseAddress
                : this.clean(dto.purchaseAddress),
            fundingType,
            shipmentStatus,
            receivableStatus,
            submitterSettlementStatus,
            orderAmount: amountData.orderAmount,
            paymentDiscountAmount: amountData.paymentDiscountAmount,
            submitterSettlementAmount,
            scanAmount: scanRebate.scanAmount,
            platformRebateAmount: amountData.platformRebateAmount,
            saleAmount,
            customerReceivedAmount,
            submitterPaidAmount,
            shippingCostAmount: amountData.shippingCostAmount,
            serviceFeeAmount: amountData.serviceFeeAmount,
            otherIncomeAmount: amountData.otherIncomeAmount,
            otherCostAmount: amountData.otherCostAmount,
            expectedProfit: profit.expectedProfit,
            settledProfit: profit.settledProfit,
            profitAdjustment: amountData.profitAdjustment,
            profitAdjustmentReason:
              dto.profitAdjustmentReason === undefined
                ? existing.profitAdjustmentReason
                : this.clean(dto.profitAdjustmentReason),
            notes:
              dto.notes === undefined ? existing.notes : this.clean(dto.notes),
            customData: Object.keys(existingCustomData).length
              ? (existingCustomData as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });

        if (dto.shipmentTrackingNo !== undefined) {
          if (shipmentTrackingNo) {
            const existingShipment = await transaction.shipment.findUnique({
              where: { trackingNo: shipmentTrackingNo },
            });
            const shipment = existingShipment
              ? await transaction.shipment.update({
                  where: { id: existingShipment.id },
                  data: {
                    status: shipmentStatus,
                    shippedAt: this.hasBeenShipped(shipmentStatus)
                      ? (existingShipment.shippedAt ?? new Date())
                      : null,
                  },
                })
              : await transaction.shipment.create({
                  data: {
                    trackingNo: shipmentTrackingNo,
                    status: shipmentStatus,
                    shippedAt: this.hasBeenShipped(shipmentStatus)
                      ? new Date()
                      : null,
                  },
                });
            await transaction.shipmentOrder.upsert({
              where: { orderId: id },
              update: { shipmentId: shipment.id },
              create: { orderId: id, shipmentId: shipment.id },
            });
          } else {
            await transaction.shipmentOrder.deleteMany({
              where: { orderId: id },
            });
          }
        } else if (
          (dto.shipmentStatus !== undefined ||
            receivableStatus === SettlementStatus.PAID) &&
          existing.shipmentLink
        ) {
          await transaction.shipment.update({
            where: { id: existing.shipmentLink.shipment.id },
            data: {
              status: shipmentStatus,
              shippedAt: this.hasBeenShipped(shipmentStatus)
                ? (existing.shipmentLink.shipment.shippedAt ?? new Date())
                : null,
            },
          });
        }

        await transaction.auditLog.create({
          data: {
            actorAdminId: admin.id,
            source: 'ADMIN_WEB',
            action: 'ORDER_UPDATED',
            entityType: 'Order',
            entityId: id,
            beforeData: {
              platformId: existing.platformId,
              submitterId: existing.submitterId,
              categoryId: existing.categoryId,
              orderedAt: existing.orderedAt.toISOString(),
              productName: existing.productNameSnapshot,
              shipmentStatus: existing.shipmentStatus,
              shipmentTrackingNo:
                existing.shipmentLink?.shipment.trackingNo ?? null,
              receivableStatus: existing.receivableStatus,
              submitterSettlementStatus: existing.submitterSettlementStatus,
              orderAmount: existing.orderAmount.toString(),
              settledProfit: existing.settledProfit.toString(),
            },
            afterData: {
              platformId: order.platformId,
              submitterId: order.submitterId,
              categoryId: order.categoryId,
              orderedAt: order.orderedAt.toISOString(),
              productName: order.productNameSnapshot,
              shipmentStatus: order.shipmentStatus,
              shipmentTrackingNo:
                dto.shipmentTrackingNo === undefined
                  ? (existing.shipmentLink?.shipment.trackingNo ?? null)
                  : shipmentTrackingNo,
              receivableStatus: order.receivableStatus,
              submitterSettlementStatus: order.submitterSettlementStatus,
              orderAmount: order.orderAmount.toString(),
              settledProfit: order.settledProfit.toString(),
              reason: this.clean(dto.reason),
            },
          },
        });
        return order;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('该平台订单号已经存在');
      }
      throw error;
    }
  }

  async list(query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const serialSort = query.serialSort ?? 'asc';
    const keyword = this.clean(query.keyword);
    const platformIds = this.ids(query.platformIds);
    const submitterIds = this.ids(query.submitterIds);
    const categoryIds = this.ids(query.categoryIds);
    const schemeIds = this.ids(query.schemeIds);
    const andFilters: Prisma.OrderWhereInput[] = [{ deletedAt: null }];

    if (keyword) {
      andFilters.push({
        OR: [
          { productNameSnapshot: { contains: keyword, mode: 'insensitive' } },
          { schemeNameSnapshot: { contains: keyword, mode: 'insensitive' } },
          { platformOrderNo: { contains: keyword, mode: 'insensitive' } },
          { inboundTrackingNo: { contains: keyword, mode: 'insensitive' } },
          { purchaseAddress: { contains: keyword, mode: 'insensitive' } },
          { notes: { contains: keyword, mode: 'insensitive' } },
          { submitter: { name: { contains: keyword, mode: 'insensitive' } } },
          {
            shipmentLink: {
              shipment: {
                trackingNo: { contains: keyword, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }

    if (query.exceptionOnly) {
      andFilters.push({
        OR: [
          { reviewStatus: ReviewStatus.REJECTED },
          { shipmentStatus: ShipmentStatus.EXCEPTION },
          { receivableStatus: SettlementStatus.EXCEPTION },
          { submitterSettlementStatus: SettlementStatus.EXCEPTION },
        ],
      });
    }

    if (query.reviewStatus)
      andFilters.push({ reviewStatus: query.reviewStatus });
    if (query.shipmentStatus)
      andFilters.push({ shipmentStatus: query.shipmentStatus });
    if (query.receivableStatus) {
      andFilters.push({ receivableStatus: query.receivableStatus });
    }
    if (query.submitterSettlementStatus) {
      andFilters.push({
        submitterSettlementStatus: query.submitterSettlementStatus,
      });
    }
    if (query.rebateScanned !== undefined) {
      andFilters.push({ rebateScanned: query.rebateScanned });
    }
    if (platformIds?.length)
      andFilters.push({ platformId: { in: platformIds } });
    if (submitterIds?.length)
      andFilters.push({ submitterId: { in: submitterIds } });
    if (categoryIds?.length)
      andFilters.push({ categoryId: { in: categoryIds } });
    if (schemeIds?.length) {
      andFilters.push({
        OR: [
          { schemeId: { in: schemeIds } },
          { shareForm: { is: { schemeId: { in: schemeIds } } } },
        ],
      });
    }
    if (query.orderedFrom || query.orderedTo) {
      andFilters.push({
        orderedAt: {
          gte: query.orderedFrom ? this.date(query.orderedFrom) : undefined,
          lt: query.orderedTo
            ? new Date(
                this.date(query.orderedTo).getTime() + 24 * 60 * 60 * 1000,
              )
            : undefined,
        },
      });
    }

    // 不同筛选字段全部放进同一个 AND 组；同一字段的多选仍通过 in 表示任一选项匹配。
    const where: Prisma.OrderWhereInput = { AND: andFilters };

    const [
      items,
      total,
      summary,
      platforms,
      categories,
      schemes,
      submitters,
      pendingReviewCount,
      customFields,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: [{ serialNo: serialSort }, { createdAt: serialSort }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          platform: { select: { id: true, name: true } },
          submitter: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, name: true } },
          scheme: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          externalIdentity: { select: { displayCode: true } },
          shipmentLink: {
            include: {
              shipment: {
                select: {
                  id: true,
                  trackingNo: true,
                  carrier: true,
                  shippedAt: true,
                },
              },
            },
          },
          customValues: {
            select: { definitionId: true, value: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({
        where,
        _sum: {
          submitterSettlementAmount: true,
          settledProfit: true,
          saleAmount: true,
        },
      }),
      this.prisma.platform.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.orderScheme.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.submitter.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, reviewStatus: ReviewStatus.PENDING },
      }),
      this.prisma.customFieldDefinition.findMany({
        where: { scope: CustomFieldScope.ORDER, enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          key: true,
          label: true,
          type: true,
          showInTable: true,
          filterable: true,
          sortOrder: true,
        },
      }),
    ]);

    const editLogs = items.length
      ? await this.prisma.auditLog.findMany({
          where: {
            entityType: 'Order',
            entityId: { in: items.map((order) => order.id) },
            action: 'ORDER_UPDATED',
          },
          orderBy: { createdAt: 'desc' },
          select: { entityId: true, afterData: true, createdAt: true },
        })
      : [];
    const editReasonHistory = new Map<
      string,
      Array<{ reason: string; createdAt: string }>
    >();
    for (const log of editLogs) {
      const reason = this.auditReason(log.afterData);
      if (!reason) continue;
      const history = editReasonHistory.get(log.entityId) ?? [];
      history.push({ reason, createdAt: log.createdAt.toISOString() });
      editReasonHistory.set(log.entityId, history);
    }

    return {
      items: items.map((order) => ({
        ...order,
        editReasonHistory: editReasonHistory.get(order.id) ?? [],
        customerRemainingAmount: Prisma.Decimal.max(
          0,
          order.saleAmount.minus(order.customerReceivedAmount),
        ),
        submitterRemainingAmount: Prisma.Decimal.max(
          0,
          order.submitterSettlementAmount.minus(order.submitterPaidAmount),
        ),
      })),
      pagination: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
      summary: {
        submitterSettlementAmount:
          summary._sum.submitterSettlementAmount?.toString() ?? '0',
        settledProfit: summary._sum.settledProfit?.toString() ?? '0',
        saleAmount: summary._sum.saleAmount?.toString() ?? '0',
      },
      quickCounts: {
        pendingReview: pendingReviewCount,
      },
      options: {
        platforms,
        categories,
        schemes,
        submitters,
        customFields,
        orderTableFields: orderTableFieldOptions(),
      },
    };
  }

  async clearEditReasons(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, serialNo: true },
    });
    if (!existing) throw new NotFoundException('订单不存在或已经删除');

    return this.prisma.$transaction(async (transaction) => {
      const logs = await transaction.auditLog.findMany({
        where: {
          entityType: 'Order',
          entityId: id,
          action: 'ORDER_UPDATED',
        },
        select: { id: true, afterData: true },
      });
      let clearedCount = 0;
      for (const log of logs) {
        if (!this.auditReason(log.afterData)) continue;
        const afterData = {
          ...(log.afterData as Prisma.JsonObject),
        } as Record<string, Prisma.JsonValue>;
        delete afterData.reason;
        await transaction.auditLog.update({
          where: { id: log.id },
          data: { afterData: afterData as Prisma.InputJsonValue },
        });
        clearedCount += 1;
      }
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'ORDER_EDIT_REASONS_CLEARED',
          entityType: 'Order',
          entityId: id,
          afterData: { clearedCount },
        },
      });
      return { id: existing.id, serialNo: existing.serialNo, clearedCount };
    });
  }

  async remove(id: string, admin: AuthenticatedAdmin) {
    const existing = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        serialNo: true,
        reviewStatus: true,
        platformOrderNo: true,
        productNameSnapshot: true,
        deletedAt: true,
      },
    });
    if (!existing) throw new NotFoundException('订单不存在或已经删除');

    return this.prisma.$transaction(async (transaction) => {
      const deletedAt = new Date();
      const order = await transaction.order.update({
        where: { id },
        data: { deletedAt },
        select: { id: true, serialNo: true, deletedAt: true },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'ORDER_DELETED',
          entityType: 'Order',
          entityId: id,
          beforeData: {
            serialNo: existing.serialNo,
            reviewStatus: existing.reviewStatus,
            platformOrderNo: existing.platformOrderNo,
            productName: existing.productNameSnapshot,
            deletedAt: existing.deletedAt,
          },
          afterData: {
            serialNo: order.serialNo,
            deletedAt: order.deletedAt?.toISOString(),
          },
        },
      });
      return order;
    });
  }

  async review(id: string, dto: ReviewOrderDto, admin: AuthenticatedAdmin) {
    if (
      dto.status !== ReviewStatus.APPROVED &&
      dto.status !== ReviewStatus.REJECTED
    ) {
      throw new BadRequestException('审核状态只能是通过或驳回');
    }
    const existing = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('订单不存在');
    if (existing.reviewStatus === dto.status) return existing;
    if (existing.reviewStatus === ReviewStatus.APPROVED) {
      throw new ConflictException('已确认订单不能重复审核');
    }

    return this.prisma.$transaction(async (transaction) => {
      const profit =
        dto.status === ReviewStatus.APPROVED
          ? await this.profitData(transaction, existing)
          : null;
      const order = await transaction.order.update({
        where: { id },
        data: {
          reviewStatus: dto.status,
          approvedAt: dto.status === ReviewStatus.APPROVED ? new Date() : null,
          approvedById: dto.status === ReviewStatus.APPROVED ? admin.id : null,
          profitRuleId: profit?.profitRuleId,
          profitRuleVersion: profit?.profitRuleVersion,
          profitRuleSnapshot: profit?.profitRuleSnapshot,
          expectedProfit: profit?.expectedProfit,
          settledProfit: profit?.settledProfit,
          notes: dto.reason
            ? [existing.notes, `审核说明：${dto.reason.trim()}`]
                .filter(Boolean)
                .join('\n')
            : undefined,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action:
            dto.status === ReviewStatus.APPROVED
              ? 'ORDER_APPROVED'
              : 'ORDER_REJECTED',
          entityType: 'Order',
          entityId: id,
          beforeData: { reviewStatus: existing.reviewStatus },
          afterData: {
            reviewStatus: order.reviewStatus,
            reason: this.clean(dto.reason),
            profitRuleId: order.profitRuleId,
            profitRuleVersion: order.profitRuleVersion,
            expectedProfit: order.expectedProfit.toString(),
          },
        },
      });
      return order;
    });
  }

  async updateProgress(
    id: string,
    dto: UpdateOrderProgressDto,
    admin: AuthenticatedAdmin,
  ) {
    const existing = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        shipmentLink: {
          include: {
            shipment: { select: { id: true, shippedAt: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('订单不存在');
    if (existing.reviewStatus !== ReviewStatus.APPROVED) {
      throw new ConflictException('订单审核确认后才能更新寄件和回款状态');
    }

    const saleAmount = new Prisma.Decimal(
      dto.saleAmount ?? existing.saleAmount,
    );
    const submitterSettlementAmount = new Prisma.Decimal(
      dto.submitterSettlementAmount ?? existing.submitterSettlementAmount,
    );
    const requestedReceivableStatus = normalizeOrderSettlementStatus(
      dto.receivableStatus,
    );
    const requestedSubmitterSettlementStatus = normalizeOrderSettlementStatus(
      dto.submitterSettlementStatus,
    );
    const receivableChanged =
      dto.saleAmount !== undefined ||
      dto.customerReceivedAmount !== undefined ||
      dto.receivableStatus !== undefined;
    const submitterSettlementChanged =
      dto.submitterSettlementAmount !== undefined ||
      dto.submitterPaidAmount !== undefined ||
      dto.submitterSettlementStatus !== undefined;
    const customerReceivedAmount = this.amountForManualStatus(
      requestedReceivableStatus,
      dto.customerReceivedAmount,
      existing.customerReceivedAmount,
      saleAmount,
    );
    const submitterPaidAmount = this.amountForManualStatus(
      requestedSubmitterSettlementStatus,
      dto.submitterPaidAmount,
      existing.submitterPaidAmount,
      submitterSettlementAmount,
    );
    const receivableStatus =
      requestedReceivableStatus ??
      (receivableChanged
        ? this.deriveSettlementStatus(saleAmount, customerReceivedAmount)
        : existing.receivableStatus);
    const shipmentStatus =
      receivableStatus === SettlementStatus.PAID &&
      (receivableChanged || dto.shipmentStatus !== undefined)
        ? ShipmentStatus.DELIVERED
        : dto.shipmentStatus;
    const submitterSettlementStatus =
      requestedSubmitterSettlementStatus ??
      (submitterSettlementChanged
        ? this.deriveSettlementStatus(
            submitterSettlementAmount,
            submitterPaidAmount,
          )
        : existing.submitterSettlementStatus);
    const profit = this.profitDataFromSnapshot({
      ...existing,
      saleAmount,
      customerReceivedAmount,
      submitterSettlementAmount,
      submitterPaidAmount,
      receivableStatus,
    });

    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.update({
        where: { id },
        data: {
          shipmentStatus,
          saleAmount,
          customerReceivedAmount,
          receivableStatus,
          submitterSettlementAmount,
          submitterPaidAmount,
          submitterSettlementStatus,
          expectedProfit: profit.expectedProfit,
          settledProfit: profit.settledProfit,
        },
      });
      if (shipmentStatus !== undefined && existing.shipmentLink) {
        await transaction.shipment.update({
          where: { id: existing.shipmentLink.shipment.id },
          data: {
            status: shipmentStatus,
            shippedAt: this.hasBeenShipped(shipmentStatus)
              ? (existing.shipmentLink.shipment.shippedAt ?? new Date())
              : null,
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          actorAdminId: admin.id,
          source: 'ADMIN_WEB',
          action: 'ORDER_PROGRESS_UPDATED',
          entityType: 'Order',
          entityId: id,
          beforeData: {
            shipmentStatus: existing.shipmentStatus,
            saleAmount: existing.saleAmount.toString(),
            customerReceivedAmount: existing.customerReceivedAmount.toString(),
            receivableStatus: existing.receivableStatus,
            submitterSettlementAmount:
              existing.submitterSettlementAmount.toString(),
            submitterPaidAmount: existing.submitterPaidAmount.toString(),
            submitterSettlementStatus: existing.submitterSettlementStatus,
            settledProfit: existing.settledProfit.toString(),
          },
          afterData: {
            shipmentStatus: order.shipmentStatus,
            saleAmount: order.saleAmount.toString(),
            customerReceivedAmount: order.customerReceivedAmount.toString(),
            receivableStatus: order.receivableStatus,
            submitterSettlementAmount:
              order.submitterSettlementAmount.toString(),
            submitterPaidAmount: order.submitterPaidAmount.toString(),
            submitterSettlementStatus: order.submitterSettlementStatus,
            settledProfit: order.settledProfit.toString(),
            reason: this.clean(dto.reason),
          },
        },
      });
      return order;
    });
  }

  async dashboard() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const start = new Date(
      `${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`,
    );
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const end = new Date(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`,
    );
    const activeWhere: Prisma.OrderWhereInput = {
      deletedAt: null,
      reviewStatus: ReviewStatus.APPROVED,
    };

    const [
      monthAggregate,
      totalAggregate,
      pendingReview,
      notShipped,
      unpaidReceipt,
      unpaidPayout,
      receivedNotPaid,
      recent,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...activeWhere, orderedAt: { gte: start, lt: end } },
        _sum: { orderAmount: true, settledProfit: true },
      }),
      this.prisma.order.aggregate({
        where: activeWhere,
        _sum: {
          saleAmount: true,
          customerReceivedAmount: true,
          submitterSettlementAmount: true,
          submitterPaidAmount: true,
        },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, reviewStatus: ReviewStatus.PENDING },
      }),
      this.prisma.order.count({
        where: { ...activeWhere, shipmentStatus: 'NOT_SHIPPED' },
      }),
      this.prisma.order.count({
        where: {
          ...activeWhere,
          receivableStatus: {
            in: [SettlementStatus.UNPAID, SettlementStatus.PARTIAL],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          ...activeWhere,
          submitterSettlementStatus: {
            in: [SettlementStatus.UNPAID, SettlementStatus.PARTIAL],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          ...activeWhere,
          receivableStatus: SettlementStatus.PAID,
          submitterSettlementStatus: {
            in: [SettlementStatus.UNPAID, SettlementStatus.PARTIAL],
          },
        },
      }),
      this.prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          serialNo: true,
          orderedAt: true,
          productNameSnapshot: true,
          reviewStatus: true,
          receivableStatus: true,
          submitterSettlementStatus: true,
          settledProfit: true,
          platform: { select: { name: true } },
          submitter: { select: { name: true } },
        },
      }),
    ]);

    return {
      metrics: {
        monthOrderAmount: monthAggregate._sum.orderAmount ?? 0,
        customerOutstandingAmount: Prisma.Decimal.max(
          0,
          (totalAggregate._sum.saleAmount ?? new Prisma.Decimal(0)).minus(
            totalAggregate._sum.customerReceivedAmount ?? 0,
          ),
        ),
        submitterOutstandingAmount: Prisma.Decimal.max(
          0,
          (
            totalAggregate._sum.submitterSettlementAmount ??
            new Prisma.Decimal(0)
          ).minus(totalAggregate._sum.submitterPaidAmount ?? 0),
        ),
        monthSettledProfit: monthAggregate._sum.settledProfit ?? 0,
      },
      queues: {
        pendingReview,
        notShipped,
        unpaidReceipt,
        unpaidPayout,
        receivedNotPaid,
      },
      recent,
    };
  }
}
