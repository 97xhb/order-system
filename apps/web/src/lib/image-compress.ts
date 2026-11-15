export interface CompressImageOptions {
  /** 允许的最大边长（像素），超出时按比例缩小。 */
  maxEdge?: number;
  /** 允许的最大 data URL 长度（字符），超出时继续压缩。 */
  maxDataUrlLength?: number;
  /** 输出格式，二维码这类需要精确保留细节的场景用 PNG。 */
  mimeType?: 'image/webp' | 'image/png';
  /** 有损格式的初始质量。 */
  quality?: number;
}

const DEFAULT_MAX_EDGE = 1_600;
const DEFAULT_MAX_DATA_URL_LENGTH = 180_000;
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const isSupportedImageType = (type: string) => SUPPORTED_IMAGE_TYPES.includes(type);

export const assertImageSize = (file: File) => {
  if (!isSupportedImageType(file.type)) {
    throw new Error('仅支持 PNG、JPG 或 WebP 图片');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('原始图片不能超过 15MB');
  }
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片读取失败，请更换图片后重试'));
    };
    image.src = objectUrl;
  });

/**
 * 把用户选择的图片压缩成 data URL，直接入库存储。
 * 与方案富文本插图共用同一套逻辑，避免再引入一套文件上传服务。
 */
export async function compressImageToDataUrl(
  file: File,
  options: CompressImageOptions = {},
): Promise<string> {
  assertImageSize(file);

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxDataUrlLength = options.maxDataUrlLength ?? DEFAULT_MAX_DATA_URL_LENGTH;
  const mimeType = options.mimeType ?? 'image/webp';
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  if (!sourceWidth || !sourceHeight) throw new Error('无法识别图片尺寸');

  let scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  let quality = options.quality ?? 0.82;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法处理这张图片');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(mimeType, quality);
    if (dataUrl.length <= maxDataUrlLength) return dataUrl;
    if (mimeType === 'image/png') {
      scale *= 0.82;
      continue;
    }
    scale *= 0.82;
    quality = Math.max(0.45, quality - 0.07);
  }

  throw new Error('图片压缩后仍然过大，请选择更小的图片');
}
