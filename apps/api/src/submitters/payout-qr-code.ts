/**
 * 回款二维码与方案富文本图片共用「图片数据直接入库」的存储方式，
 * 不额外引入文件上传服务，部署时也不需要挂载存储卷。
 */

/** 二维码图片数据（data URL）的最大长度，与前端压缩上限保持一致。 */
export const PAYOUT_QR_CODE_MAX_LENGTH = 200_000;

const DATA_URL_PATTERN =
  /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

export function isValidQrCodeDataUrl(value: string): boolean {
  return (
    value.length <= PAYOUT_QR_CODE_MAX_LENGTH && DATA_URL_PATTERN.test(value)
  );
}

export function normalizeQrCodeDataUrl(
  value: string | undefined,
): string | null | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized;
}
