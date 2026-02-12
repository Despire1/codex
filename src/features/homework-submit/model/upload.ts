import { HomeworkAttachment } from '../../../entities/types';
import { api } from '../../../shared/api/client';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim();

const createAttachmentId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const resolveBaseUrl = () => {
  if (API_BASE) return API_BASE;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
};

export const resolveHomeworkStorageUrl = (value: string) => {
  if (!value) return value;
  if (isAbsoluteUrl(value) || value.startsWith('blob:') || value.startsWith('data:')) return value;
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return value;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

export const uploadFileToHomeworkStorage = async (
  file: File,
  scope: 'homework-student-attachment' | 'homework-student-voice' = 'homework-student-attachment',
): Promise<HomeworkAttachment> => {
  const presign = await api.createFilePresignV2({
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    scope,
  });

  const headers = new Headers(presign.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', file.type || 'application/octet-stream');
  }

  const response = await fetch(resolveHomeworkStorageUrl(presign.uploadUrl), {
    method: presign.method,
    headers,
    body: file,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `upload_failed_${response.status}`);
  }

  return {
    id: createAttachmentId(),
    fileName: file.name,
    size: file.size,
    url: resolveHomeworkStorageUrl(presign.fileUrl),
    status: 'ready',
  };
};
