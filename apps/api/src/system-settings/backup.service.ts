import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { verifyPassword } from '../auth/password';
import type { AuthenticatedAdmin } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { BackupSelection } from './dto/backup.dto';

const BACKUP_MAGIC = 'ORDER_SYSTEM_BACKUP';
const BACKUP_VERSION = 2;
const LEGACY_BACKUP_VERSION = 1;
const BACKUP_SECRET_FORMAT = 'osb1';

const BACKUP_MODELS = [
  { delegate: 'adminUser', table: 'admin_users' },
  { delegate: 'systemSetting', table: 'system_settings' },
  { delegate: 'logisticsSetting', table: 'logistics_settings' },
  { delegate: 'platform', table: 'platforms' },
  { delegate: 'submitter', table: 'submitters' },
  { delegate: 'category', table: 'categories' },
  { delegate: 'orderScheme', table: 'order_schemes' },
  { delegate: 'shareForm', table: 'share_forms' },
  { delegate: 'customer', table: 'customers' },
  { delegate: 'profitRule', table: 'profit_rules' },
  { delegate: 'payoutRegistrationForm', table: 'payout_registration_forms' },
  { delegate: 'externalIdentity', table: 'external_identities' },
  { delegate: 'customFieldDefinition', table: 'custom_field_definitions' },
  { delegate: 'affiliatePlatform', table: 'affiliate_platforms' },
  { delegate: 'adminSession', table: 'admin_sessions' },
  { delegate: 'payoutMethod', table: 'payout_methods' },
  { delegate: 'order', table: 'orders' },
  { delegate: 'shipment', table: 'shipments' },
  { delegate: 'receipt', table: 'receipts' },
  { delegate: 'payout', table: 'payouts' },
  { delegate: 'externalIdentitySession', table: 'external_identity_sessions' },
  { delegate: 'shipmentOrder', table: 'shipment_orders' },
  { delegate: 'receiptAllocation', table: 'receipt_allocations' },
  { delegate: 'payoutAllocation', table: 'payout_allocations' },
  { delegate: 'orderCustomFieldValue', table: 'order_custom_field_values' },
  { delegate: 'affiliateAccount', table: 'affiliate_accounts' },
  {
    delegate: 'affiliatePromotionChannel',
    table: 'affiliate_promotion_channels',
  },
  { delegate: 'affiliateLinkConversion', table: 'affiliate_link_conversions' },
  { delegate: 'affiliateOrder', table: 'affiliate_orders' },
  { delegate: 'auditLog', table: 'audit_logs' },
] as const;

type BackupModel = (typeof BACKUP_MODELS)[number]['delegate'];
type BackupCategory = Exclude<BackupSelection, 'all'>;
type BackupScope = 'FULL' | 'SELECTIVE';

type BackupCategoryDefinition = {
  id: BackupCategory;
  label: string;
  description: string;
  models: readonly BackupModel[];
  dependencies: readonly BackupModel[];
  dependencyNote?: string;
};

const BACKUP_CATEGORIES: readonly BackupCategoryDefinition[] = [
  {
    id: 'orders',
    label: '订单列表',
    description: '订单、客户、物流、收货回款、下单人结算及自定义字段值',
    models: [
      'customer',
      'order',
      'shipment',
      'receipt',
      'payout',
      'shipmentOrder',
      'receiptAllocation',
      'payoutAllocation',
      'orderCustomFieldValue',
    ],
    dependencies: [
      'adminUser',
      'platform',
      'submitter',
      'category',
      'orderScheme',
      'shareForm',
      'profitRule',
      'payoutMethod',
      'externalIdentity',
      'customFieldDefinition',
    ],
    dependencyNote: '自动附带平台、品类、下单人、方案等必要引用数据',
  },
  {
    id: 'submitters',
    label: '下单人与回款',
    description: '下单人、识别码、回款方式、回款登记与查询配置',
    models: [
      'submitter',
      'payoutRegistrationForm',
      'externalIdentity',
      'externalIdentitySession',
      'payoutMethod',
    ],
    dependencies: [],
  },
  {
    id: 'catalog',
    label: '平台与在线报单',
    description: '平台、品类、在线报单方案、分享页、利润规则和字段配置',
    models: [
      'platform',
      'category',
      'orderScheme',
      'shareForm',
      'profitRule',
      'customFieldDefinition',
    ],
    dependencies: ['adminUser'],
    dependencyNote: '自动附带方案及规则的创建人引用',
  },
  {
    id: 'integrationConfig',
    label: '接口配置',
    description: 'ApiZero 快递、返利平台账号、接口密钥和推广渠道',
    models: [
      'logisticsSetting',
      'affiliatePlatform',
      'affiliateAccount',
      'affiliatePromotionChannel',
    ],
    dependencies: [],
  },
  {
    id: 'affiliateHistory',
    label: '返利历史',
    description: '返利链接转换历史和返利订单记录',
    models: ['affiliateLinkConversion', 'affiliateOrder'],
    dependencies: [
      'adminUser',
      'platform',
      'submitter',
      'category',
      'orderScheme',
      'shareForm',
      'customer',
      'profitRule',
      'externalIdentity',
      'affiliatePlatform',
      'affiliateAccount',
      'order',
      'affiliatePromotionChannel',
    ],
    dependencyNote: '自动附带返利接口及已关联订单的必要引用数据',
  },
  {
    id: 'system',
    label: '系统与管理员',
    description: '面板与安全设置、管理员账号和登录会话',
    models: ['adminUser', 'systemSetting', 'adminSession'],
    dependencies: [],
  },
  {
    id: 'auditLogs',
    label: '操作日志',
    description: '系统、后台和公开链接产生的操作审计记录',
    models: ['auditLog'],
    dependencies: ['adminUser'],
    dependencyNote: '自动附带日志中的管理员引用',
  },
] as const;

const BACKUP_TABLES_SQL = BACKUP_MODELS.map((item) => `"${item.table}"`).join(
  ', ',
);
const SCHEMA_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify(BACKUP_MODELS))
  .digest('hex');
const ALL_MODEL_NAMES = BACKUP_MODELS.map((item) => item.delegate);
const ALL_CATEGORY_IDS = BACKUP_CATEGORIES.map((item) => item.id);

type BackupTable = {
  model: BackupModel;
  table: string;
  rows: unknown[];
};

type LegacyBackupPayload = {
  magic: typeof BACKUP_MAGIC;
  version: typeof LEGACY_BACKUP_VERSION;
  createdAt: string;
  schemaFingerprint: string;
  tables: BackupTable[];
};

type BackupPayload = {
  magic: typeof BACKUP_MAGIC;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  schemaFingerprint: string;
  scope: BackupScope;
  categories: BackupCategory[];
  primaryModels: BackupModel[];
  dependencyModels: BackupModel[];
  tables: BackupTable[];
};

type DecodedBackup = LegacyBackupPayload | BackupPayload;

type Delegate = {
  findMany: () => Promise<unknown[]>;
  createMany: (args: {
    data: unknown[];
    skipDuplicates?: boolean;
  }) => Promise<{ count: number }>;
  upsert: (args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => Promise<unknown>;
};

@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getOptions() {
    return {
      defaultSelection: ['all'] satisfies BackupSelection[],
      options: [
        {
          id: 'all' as const,
          label: '全部数据',
          description: '完整备份全部业务数据、配置、管理员、会话和日志',
          modelCount: BACKUP_MODELS.length,
          dependencyNote: '恢复时完整替换当前数据库，并撤销全部登录会话',
        },
        ...BACKUP_CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          description: category.description,
          modelCount: category.models.length,
          dependencyNote: category.dependencyNote || null,
        })),
      ],
    };
  }

  private secret() {
    return this.config.getOrThrow<string>('DATA_ENCRYPTION_KEY');
  }

  private key() {
    return createHash('sha256').update(this.secret(), 'utf8').digest();
  }

  private normalizeValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
      const constructorName = (value as { constructor?: { name?: string } })
        .constructor?.name;
      if (
        constructorName?.startsWith('Decimal') ||
        Object.prototype.toString.call(value) === '[object Decimal]'
      ) {
        return String(value);
      }
      if (Buffer.isBuffer(value)) {
        return { __backupBuffer: value.toString('base64') };
      }
      if (Array.isArray(value)) {
        return value.map((item) => this.normalizeValue(item));
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.normalizeValue(item),
        ]),
      );
    }
    return value;
  }

  private getDelegate(
    client: PrismaService | Prisma.TransactionClient,
    name: BackupModel,
  ) {
    const delegate = (client as unknown as Record<string, unknown>)[name];
    if (!delegate || typeof delegate !== 'object') {
      throw new Error(`备份模型不存在：${name}`);
    }
    return delegate as Delegate;
  }

  private encrypt(payload: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
    return Buffer.from(
      JSON.stringify({
        format: BACKUP_SECRET_FORMAT,
        iv: iv.toString('base64url'),
        tag: cipher.getAuthTag().toString('base64url'),
        data: ciphertext.toString('base64url'),
      }),
      'utf8',
    );
  }

  private decrypt(buffer: Buffer) {
    let envelope: {
      format?: string;
      iv?: string;
      tag?: string;
      data?: string;
    };
    try {
      envelope = JSON.parse(buffer.toString('utf8')) as typeof envelope;
    } catch {
      throw new BadRequestException('备份文件格式不正确');
    }
    if (
      envelope.format !== BACKUP_SECRET_FORMAT ||
      !envelope.iv ||
      !envelope.tag ||
      !envelope.data
    ) {
      throw new BadRequestException('备份文件版本不受支持');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(envelope.iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64url')),
        decipher.final(),
      ]);
    } catch {
      throw new BadRequestException(
        '备份文件无法解密，请确认使用同一套数据密钥',
      );
    }
  }

  private validateTableList(
    tables: BackupTable[],
    expectedModels: readonly BackupModel[],
  ) {
    const expected = BACKUP_MODELS.filter((item) =>
      expectedModels.includes(item.delegate),
    );
    if (tables.length !== expected.length) {
      throw new BadRequestException('备份文件缺少必要的数据表');
    }
    expected.forEach((model, index) => {
      const table = tables[index];
      if (
        !table ||
        table.model !== model.delegate ||
        table.table !== model.table ||
        !Array.isArray(table.rows)
      ) {
        throw new BadRequestException('备份文件的数据表结构不正确');
      }
    });
  }

  private decode(input: string): { payload: DecodedBackup; bytes: number } {
    const normalized = input.replace(/^data:.*?;base64,/, '').trim();
    let encrypted: Buffer;
    try {
      encrypted = Buffer.from(normalized, 'base64');
      if (!encrypted.length) throw new Error();
    } catch {
      throw new BadRequestException('备份内容不是有效的 Base64 文件');
    }

    let payload: DecodedBackup;
    try {
      payload = JSON.parse(
        gunzipSync(this.decrypt(encrypted)).toString('utf8'),
      ) as DecodedBackup;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('备份文件内容损坏');
    }

    if (
      payload.magic !== BACKUP_MAGIC ||
      payload.schemaFingerprint !== SCHEMA_FINGERPRINT ||
      !Array.isArray(payload.tables)
    ) {
      throw new BadRequestException('备份文件与当前系统版本不匹配');
    }

    if (payload.version === LEGACY_BACKUP_VERSION) {
      this.validateTableList(payload.tables, ALL_MODEL_NAMES);
      return { payload, bytes: encrypted.length };
    }

    if (
      payload.version !== BACKUP_VERSION ||
      !['FULL', 'SELECTIVE'].includes(payload.scope) ||
      !Array.isArray(payload.categories) ||
      !Array.isArray(payload.primaryModels) ||
      !Array.isArray(payload.dependencyModels) ||
      payload.categories.some((item) => !ALL_CATEGORY_IDS.includes(item)) ||
      payload.primaryModels.some((item) => !ALL_MODEL_NAMES.includes(item)) ||
      payload.dependencyModels.some((item) => !ALL_MODEL_NAMES.includes(item))
    ) {
      throw new BadRequestException('备份文件与当前系统版本不匹配');
    }

    const declaredSelection = this.resolveSelection(payload.categories);
    const sameList = <T>(left: readonly T[], right: readonly T[]) =>
      left.length === right.length &&
      left.every((item, index) => item === right[index]);
    if (
      payload.scope !== declaredSelection.scope ||
      !sameList(payload.categories, declaredSelection.categories) ||
      !sameList(payload.primaryModels, declaredSelection.primaryModels) ||
      !sameList(payload.dependencyModels, declaredSelection.dependencyModels)
    ) {
      throw new BadRequestException('备份文件的分类范围不完整');
    }

    const expectedModels = BACKUP_MODELS.filter(
      (item) =>
        declaredSelection.primaryModels.includes(item.delegate) ||
        declaredSelection.dependencyModels.includes(item.delegate),
    ).map((item) => item.delegate);
    this.validateTableList(payload.tables, expectedModels);
    if (
      payload.scope === 'FULL' &&
      (payload.primaryModels.length !== ALL_MODEL_NAMES.length ||
        payload.dependencyModels.length)
    ) {
      throw new BadRequestException('完整备份文件缺少必要的数据表');
    }
    if (!payload.primaryModels.length) {
      throw new BadRequestException('选择性备份没有可恢复的数据');
    }
    return { payload, bytes: encrypted.length };
  }

  private resolveSelection(selections: readonly BackupSelection[]) {
    const uniqueSelections = [...new Set(selections)];
    const selectedCategories = BACKUP_CATEGORIES.filter((category) =>
      uniqueSelections.includes(category.id),
    );
    const full =
      !uniqueSelections.length ||
      uniqueSelections.includes('all') ||
      selectedCategories.length === BACKUP_CATEGORIES.length;

    if (full) {
      return {
        scope: 'FULL' as const,
        categories: [...ALL_CATEGORY_IDS],
        primaryModels: [...ALL_MODEL_NAMES],
        dependencyModels: [] as BackupModel[],
      };
    }
    if (!selectedCategories.length) {
      throw new BadRequestException('请至少选择一个备份分类');
    }

    const primarySet = new Set<BackupModel>(
      selectedCategories.flatMap((category) => [...category.models]),
    );
    const dependencySet = new Set<BackupModel>(
      selectedCategories.flatMap((category) => [...category.dependencies]),
    );
    primarySet.forEach((model) => dependencySet.delete(model));
    return {
      scope: 'SELECTIVE' as const,
      categories: selectedCategories.map((category) => category.id),
      primaryModels: BACKUP_MODELS.filter((item) =>
        primarySet.has(item.delegate),
      ).map((item) => item.delegate),
      dependencyModels: BACKUP_MODELS.filter((item) =>
        dependencySet.has(item.delegate),
      ).map((item) => item.delegate),
    };
  }

  async exportBackup(): Promise<Buffer>;
  async exportBackup(selections: readonly BackupSelection[]): Promise<{
    buffer: Buffer;
    scope: BackupScope;
  }>;
  async exportBackup(
    selections?: readonly BackupSelection[],
  ): Promise<Buffer | { buffer: Buffer; scope: BackupScope }> {
    const selection = this.resolveSelection(selections || ['all']);
    const includedModels = new Set<BackupModel>([
      ...selection.primaryModels,
      ...selection.dependencyModels,
    ]);
    const tables: BackupTable[] = [];
    for (const model of BACKUP_MODELS) {
      if (!includedModels.has(model.delegate)) continue;
      const rows = await this.getDelegate(
        this.prisma,
        model.delegate,
      ).findMany();
      tables.push({
        model: model.delegate,
        table: model.table,
        rows: rows.map((row) => this.normalizeValue(row)),
      });
    }
    const payload: BackupPayload = {
      magic: BACKUP_MAGIC,
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      schemaFingerprint: SCHEMA_FINGERPRINT,
      ...selection,
      tables,
    };
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), {
      level: 9,
    });
    const buffer = this.encrypt(compressed);
    return selections ? { buffer, scope: selection.scope } : buffer;
  }

  private metadata(payload: DecodedBackup) {
    if (payload.version === LEGACY_BACKUP_VERSION) {
      return {
        scope: 'FULL' as const,
        categories: [...ALL_CATEGORY_IDS],
        primaryModels: [...ALL_MODEL_NAMES],
        dependencyModels: [] as BackupModel[],
      };
    }
    return {
      scope: payload.scope,
      categories: payload.categories,
      primaryModels: payload.primaryModels,
      dependencyModels: payload.dependencyModels,
    };
  }

  async inspect(input: string) {
    const { payload, bytes } = this.decode(input);
    const metadata = this.metadata(payload);
    const categoryLabels = BACKUP_CATEGORIES.filter((category) =>
      metadata.categories.includes(category.id),
    ).map((category) => category.label);
    const primaryModels = new Set(metadata.primaryModels);
    const dependencyModels = new Set(metadata.dependencyModels);
    const primaryRecordCount = payload.tables.reduce(
      (total, table) =>
        total + (primaryModels.has(table.model) ? table.rows.length : 0),
      0,
    );
    const dependencyRecordCount = payload.tables.reduce(
      (total, table) =>
        total + (dependencyModels.has(table.model) ? table.rows.length : 0),
      0,
    );
    return {
      valid: true,
      version: payload.version,
      createdAt: payload.createdAt,
      bytes,
      scope: metadata.scope,
      categories: metadata.categories,
      categoryLabels,
      primaryRecordCount,
      dependencyRecordCount,
      requiresRelogin:
        metadata.scope === 'FULL' || metadata.categories.includes('system'),
      tables: payload.tables.map((table) => ({
        model: table.model,
        table: table.table,
        count: table.rows.length,
        dependency: dependencyModels.has(table.model),
      })),
      totalRecords: payload.tables.reduce(
        (total, table) => total + table.rows.length,
        0,
      ),
    };
  }

  private async assertAdminPassword(
    admin: AuthenticatedAdmin,
    password: string,
  ) {
    const record = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { passwordHash: true, status: true },
    });
    if (
      !record ||
      record.status !== 'ACTIVE' ||
      !(await verifyPassword(password, record.passwordHash))
    ) {
      throw new UnauthorizedException('管理员密码验证失败');
    }
  }

  private tableRows(payload: DecodedBackup, model: BackupModel) {
    return payload.tables.find((item) => item.model === model)?.rows || [];
  }

  private rowData(row: unknown) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new BadRequestException('备份文件包含无效的数据行');
    }
    return row as Record<string, unknown>;
  }

  private upsertWhere(model: BackupModel, row: Record<string, unknown>) {
    if (model === 'shipmentOrder') {
      if (!row.shipmentId || !row.orderId) {
        throw new BadRequestException('备份文件中的物流订单关联缺少主键');
      }
      return {
        shipmentId_orderId: {
          shipmentId: row.shipmentId,
          orderId: row.orderId,
        },
      };
    }
    if (!row.id) {
      throw new BadRequestException(`备份文件中的 ${model} 数据缺少主键`);
    }
    return { id: row.id };
  }

  private upsertUpdate(model: BackupModel, row: Record<string, unknown>) {
    const update = { ...row };
    delete update.id;
    if (model === 'shipmentOrder') {
      delete update.shipmentId;
      delete update.orderId;
    }
    return update;
  }

  private async restoreFull(
    transaction: Prisma.TransactionClient,
    payload: DecodedBackup,
  ) {
    await transaction.$executeRawUnsafe(
      `TRUNCATE TABLE ${BACKUP_TABLES_SQL} RESTART IDENTITY CASCADE`,
    );
    let total = 0;
    for (const model of BACKUP_MODELS) {
      const rows = this.tableRows(payload, model.delegate);
      if (!rows.length) continue;
      const result = await this.getDelegate(
        transaction,
        model.delegate,
      ).createMany({ data: rows });
      total += result.count;
    }
    await transaction.adminSession.updateMany({
      data: { revokedAt: new Date() },
    });
    await transaction.externalIdentitySession.updateMany({
      data: { revokedAt: new Date() },
    });
    return { total, requiresRelogin: true };
  }

  private async restoreSelective(
    transaction: Prisma.TransactionClient,
    payload: DecodedBackup,
    primaryModels: readonly BackupModel[],
    dependencyModels: readonly BackupModel[],
    categories: readonly BackupCategory[],
  ) {
    const primarySet = new Set(primaryModels);
    const dependencySet = new Set(dependencyModels);
    let total = 0;
    for (const model of BACKUP_MODELS) {
      const rows = this.tableRows(payload, model.delegate);
      if (!rows.length) continue;
      const delegate = this.getDelegate(transaction, model.delegate);
      if (dependencySet.has(model.delegate)) {
        const result = await delegate.createMany({
          data: rows,
          skipDuplicates: true,
        });
        total += result.count;
        continue;
      }
      if (!primarySet.has(model.delegate)) continue;
      for (const rawRow of rows) {
        const row = this.rowData(rawRow);
        await delegate.upsert({
          where: this.upsertWhere(model.delegate, row),
          create: row,
          update: this.upsertUpdate(model.delegate, row),
        });
        total += 1;
      }
    }

    const requiresRelogin = categories.includes('system');
    if (requiresRelogin) {
      await transaction.adminSession.updateMany({
        data: { revokedAt: new Date() },
      });
      await transaction.externalIdentitySession.updateMany({
        data: { revokedAt: new Date() },
      });
    }
    return { total, requiresRelogin };
  }

  async restore(
    input: string,
    password: string,
    confirmation: string,
    admin: AuthenticatedAdmin,
  ) {
    if (confirmation.trim().toUpperCase() !== 'RESTORE') {
      throw new BadRequestException('请输入确认词 RESTORE');
    }
    await this.assertAdminPassword(admin, password);
    const { payload } = this.decode(input);
    const metadata = this.metadata(payload);

    const result = await this.prisma.$transaction(async (transaction) =>
      metadata.scope === 'FULL'
        ? this.restoreFull(transaction, payload)
        : this.restoreSelective(
            transaction,
            payload,
            metadata.primaryModels,
            metadata.dependencyModels,
            metadata.categories,
          ),
    );

    const restoredAdmin = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { id: true },
    });
    if (restoredAdmin) {
      await this.prisma.auditLog.create({
        data: {
          actorAdminId: restoredAdmin.id,
          source: 'ADMIN_WEB',
          action: 'BACKUP_RESTORED',
          entityType: 'Backup',
          entityId: 'restore',
          afterData: {
            scope: metadata.scope,
            categories: metadata.categories,
            totalRecords: result.total,
            backupCreatedAt: payload.createdAt,
            sessionsRevoked: result.requiresRelogin,
          } satisfies Prisma.InputJsonObject,
        },
      });
    }

    return {
      restored: true,
      scope: metadata.scope,
      categories: metadata.categories,
      totalRecords: result.total,
      createdAt: payload.createdAt,
      requiresRelogin: result.requiresRelogin,
    };
  }
}
