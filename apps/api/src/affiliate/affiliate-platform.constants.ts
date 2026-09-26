export type AffiliateProviderType = 'THIRD_PARTY' | 'OFFICIAL';

export type AffiliateAdapterType =
  'LIHUA_XIONG' | 'YOUZAI_ASSISTANT' | 'NOT_IMPLEMENTED';

export type AffiliateCredentialKey =
  'apiKey' | 'apiSecret' | 'accessToken' | 'promotionId';

export interface AffiliateCredentialFieldDefinition {
  key: AffiliateCredentialKey;
  label: string;
  placeholder: string;
}

export interface AffiliatePlatformDefinition {
  code: string;
  name: string;
  shortName: string;
  providerType: AffiliateProviderType;
  adapterType: AffiliateAdapterType;
  description: string;
  defaultApiBaseUrl: string | null;
  supportedPlatforms: Array<{ code: string; name: string }>;
  credentialFields: AffiliateCredentialFieldDefinition[];
}

const standardCredentialFields = (
  apiKeyLabel: string,
  apiSecretLabel: string,
  tokenLabel: string,
  promotionIdLabel: string,
): AffiliateCredentialFieldDefinition[] => [
  {
    key: 'apiKey',
    label: apiKeyLabel,
    placeholder: `填写${apiKeyLabel}`,
  },
  {
    key: 'apiSecret',
    label: apiSecretLabel,
    placeholder: `填写${apiSecretLabel}`,
  },
  {
    key: 'accessToken',
    label: tokenLabel,
    placeholder: `填写${tokenLabel}，没有时可留空`,
  },
  {
    key: 'promotionId',
    label: promotionIdLabel,
    placeholder: `填写${promotionIdLabel}，后续用于渠道归因`,
  },
];

export const AFFILIATE_PLATFORM_DEFINITIONS: AffiliatePlatformDefinition[] = [
  {
    code: 'third_party_aggregator',
    name: '梨花熊聚合返利接口',
    shortName: '梨',
    providerType: 'THIRD_PARTY',
    adapterType: 'LIHUA_XIONG',
    description: '适配现有易语言协议，可转换多个电商平台的返利链接。',
    defaultApiBaseUrl:
      'https://bb21f9.xapi2159.dhcc.wang/api/goods/linkConvert',
    supportedPlatforms: [
      { code: 'taobao', name: '淘宝' },
      { code: 'jd', name: '京东' },
      { code: 'vipshop', name: '唯品会' },
      { code: 'pdd', name: '拼多多' },
      { code: 'douyin', name: '抖音' },
      { code: 'kuaishou', name: '快手' },
      { code: 'meituan', name: '美团' },
      { code: 'shangou', name: '闪购' },
      { code: 'tuangou', name: '团购' },
    ],
    credentialFields: [
      {
        key: 'apiKey',
        label: 'XID',
        placeholder: '选填，不填使用源码默认 XID',
      },
      {
        key: 'apiSecret',
        label: '签名盐',
        placeholder: '选填，不填使用源码默认签名盐',
      },
      {
        key: 'accessToken',
        label: '登录 Token',
        placeholder: '填写当前有效的梨花熊登录 Token',
      },
      {
        key: 'promotionId',
        label: '渠道号',
        placeholder: '选填，后续用于渠道归因',
      },
    ],
  },
  {
    code: 'youzai_assistant',
    name: '有赞助手聚合返利接口',
    shortName: '赞',
    providerType: 'THIRD_PARTY',
    adapterType: 'YOUZAI_ASSISTANT',
    description:
      '适配有赞助手小程序接口，覆盖抖音、京东、拼多多的商品口令与链接转换。',
    defaultApiBaseUrl: 'https://appletsvr.52youzai.com',
    supportedPlatforms: [
      { code: 'douyin', name: '抖音' },
      { code: 'jd', name: '京东' },
      { code: 'pdd', name: '拼多多' },
    ],
    credentialFields: [
      {
        key: 'accessToken',
        label: 'Authorization',
        placeholder:
          '填写有赞助手小程序抓取到的 Authorization 值（32 位，不带 Bearer）',
      },
    ],
  },
  {
    code: 'taobao_union',
    name: '淘宝联盟',
    shortName: '淘',
    providerType: 'OFFICIAL',
    adapterType: 'NOT_IMPLEMENTED',
    description: '淘宝官方联盟接口，仅用于淘宝商品链接转换。',
    defaultApiBaseUrl: null,
    supportedPlatforms: [{ code: 'taobao', name: '淘宝' }],
    credentialFields: standardCredentialFields(
      'App Key',
      'App Secret',
      'Session / Token',
      '推广位 PID',
    ),
  },
  {
    code: 'jingfen',
    name: '京粉',
    shortName: '京',
    providerType: 'OFFICIAL',
    adapterType: 'NOT_IMPLEMENTED',
    description: '京东官方联盟接口，仅用于京东商品链接转换。',
    defaultApiBaseUrl: null,
    supportedPlatforms: [{ code: 'jd', name: '京东' }],
    credentialFields: standardCredentialFields(
      'App Key',
      'App Secret',
      'Access Token',
      '联盟 ID / 推广位',
    ),
  },
  {
    code: 'weixiangke',
    name: '唯享客',
    shortName: '唯',
    providerType: 'OFFICIAL',
    adapterType: 'NOT_IMPLEMENTED',
    description: '唯品会官方联盟接口，仅用于唯品会商品链接转换。',
    defaultApiBaseUrl: null,
    supportedPlatforms: [{ code: 'vipshop', name: '唯品会' }],
    credentialFields: standardCredentialFields(
      'App Key',
      'App Secret',
      'Access Token',
      '推广位 / Relation ID',
    ),
  },
];

export const AFFILIATE_PLATFORM_DEFINITION_MAP = new Map(
  AFFILIATE_PLATFORM_DEFINITIONS.map((definition) => [
    definition.code,
    definition,
  ]),
);
