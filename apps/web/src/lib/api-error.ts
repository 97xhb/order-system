import axios from 'axios';

export function getApiErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (!axios.isAxiosError(error)) return fallback;

  const message = error.response?.data?.message;
  if (Array.isArray(message)) return message.join('；');
  if (typeof message === 'string' && message.trim()) return message;
  if (error.code === 'ECONNABORTED') return '请求超时，请检查网络后重试';
  return fallback;
}
