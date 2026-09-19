export const apiMethods = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
] as const;

export type ApiMethod = (typeof apiMethods)[number];

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
}

export interface OpenApiDocument {
  info?: {
    title?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, unknown>>;
}

export interface ApiEndpointItem {
  method: ApiMethod;
  path: string;
  summary: string;
  tag: string;
}

const apiTagLabels: Record<string, string> = {
  'admin catalog': '平台与品类配置',
  'admin-orders': '订单管理',
  'admin-payout-methods': '回款方式',
  'admin-payout-query': '订单查询配置',
  'admin-payout-registration': '回款登记配置',
  'admin-schemes': '在线报单',
  'admin-submitters': '回款登记',
  'admin-system': '系统设置',
  'affiliate platforms': '返利平台',
  auth: '登录认证',
  'profit rules': '利润规则',
  'public-forms': '公开下单登记',
  'public-payout-query': '公开订单查询',
  'public-payout-registration': '公开回款登记',
  system: '系统公共接口',
  other: '其他',
};

const apiMethodOrder = new Map<ApiMethod, number>(
  apiMethods.map((method, index) => [method, index]),
);

export const apiTagLabel = (tag: string) => apiTagLabels[tag] || tag;

export const normalizeApiEndpoints = (document: OpenApiDocument) => {
  const endpoints: ApiEndpointItem[] = [];
  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    for (const [methodName, rawOperation] of Object.entries(pathItem || {})) {
      const method = methodName.toLowerCase() as ApiMethod;
      if (!apiMethods.includes(method) || !rawOperation || typeof rawOperation !== 'object') {
        continue;
      }
      const operation = rawOperation as OpenApiOperation;
      const tag = operation.tags?.find((item) => item.trim())?.trim() || 'other';
      endpoints.push({
        method,
        path: path.startsWith('/') ? path : `/${path}`,
        summary:
          operation.summary?.trim() ||
          operation.description?.trim() ||
          operation.operationId?.trim() ||
          '暂无接口说明',
        tag,
      });
    }
  }

  return endpoints.sort((left, right) => {
    const tagResult = apiTagLabel(left.tag).localeCompare(apiTagLabel(right.tag), 'zh-CN');
    if (tagResult !== 0) return tagResult;
    const pathResult = left.path.localeCompare(right.path);
    if (pathResult !== 0) return pathResult;
    return (apiMethodOrder.get(left.method) ?? 99) - (apiMethodOrder.get(right.method) ?? 99);
  });
};
